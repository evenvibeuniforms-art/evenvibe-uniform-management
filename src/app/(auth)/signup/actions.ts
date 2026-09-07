'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const signupSchema = z.object({
  schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
  schoolCode: z.string().trim().min(2, "School code is required"),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  district: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactEmail: z.string().trim().email("Invalid email address"),
  contactPhone: z.string().trim().optional(),
  
  adminFullName: z.string().trim().min(2, "Admin full name is required"),
  adminEmail: z.string().trim().email("Invalid admin email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

export type SignupFormValues = z.infer<typeof signupSchema>;

export async function signupSchool(formData: SignupFormValues) {
  try {
    // 1. Server-side validation
    const data = signupSchema.parse(formData);

    const supabase = await createClient();

    // 2. Call Supabase Auth signUp, passing onboarding data into safe user_metadata
    // Do NOT pass school_id, role, or is_active!
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.adminEmail,
      password: data.password,
      options: {
        data: {
          onboarding_school_name: data.schoolName,
          onboarding_school_code: data.schoolCode,
          onboarding_address: data.address || null,
          onboarding_city: data.city || null,
          onboarding_district: data.district || null,
          onboarding_state: data.state || null,
          onboarding_pincode: data.pincode || null,
          onboarding_contact_name: data.contactName,
          onboarding_contact_email: data.contactEmail,
          onboarding_contact_phone: data.contactPhone || null,
          onboarding_admin_full_name: data.adminFullName,
        }
      }
    });

    if (authError) {
      if (authError.message?.includes('already registered')) {
         return { success: false, error: 'Email address is already in use.' };
      }
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'Unable to create account. Please try again.' };
    }

    // 3. If a session was immediately established (Email Confirmation disabled)
    // we can securely execute the onboarding right now.
    if (authData.session) {
      const { error: rpcError } = await supabase.rpc('register_school');
      
      // Immediately sign out since the account is pending approval anyway
      await supabase.auth.signOut();

      if (rpcError) {
        if (rpcError.message?.includes('School code already exists')) {
          return { success: false, error: 'School code is already in use.' }
        }
        return { success: false, error: 'Account created but onboarding failed. Please contact support.' }
      }
    }

    // Return success. The UI will show "Pending Approval" or "Check Email"
    return { 
      success: true, 
      requireEmailConfirmation: !authData.session 
    };

  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: "Validation failed. Please check the form." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }
}
