'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const signupSchema = z.object({
  schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
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

/**
 * Generate a unique school code server-side to satisfy database constraints
 * without requiring the registrant to provide or see one.
 */
async function generateUniqueSchoolCode(supabase: Awaited<ReturnType<typeof createClient>>, schoolName: string): Promise<string> {
  const words = schoolName.trim().replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  let prefix = "";
  if (words.length >= 2) {
    prefix = words.map((w) => w[0].toUpperCase()).join("").substring(0, 4);
  } else if (words.length === 1) {
    prefix = words[0].substring(0, 4).toUpperCase();
  }
  if (!prefix || prefix.length < 2) {
    prefix = "SCH";
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${randomDigits}`;

    const { data } = await supabase
      .from("schools")
      .select("id")
      .eq("school_code", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }
  }

  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export async function signupSchool(formData: SignupFormValues) {
  try {
    // 1. Server-side validation
    const data = signupSchema.parse(formData);

    const supabase = await createClient();

    // 2. Generate unique school code on server for database compatibility
    const generatedSchoolCode = await generateUniqueSchoolCode(supabase, data.schoolName);

    // 3. Call Supabase Auth signUp, passing onboarding data into safe user_metadata
    // Do NOT pass school_id, role, or is_active!
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.adminEmail,
      password: data.password,
      options: {
        data: {
          onboarding_school_name: data.schoolName,
          onboarding_school_code: generatedSchoolCode,
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
      let rpcError = null;
      if (authData.session.access_token) {
        const authedClient = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
          {
            global: {
              headers: {
                Authorization: `Bearer ${authData.session.access_token}`,
              },
            },
          }
        );
        const { error } = await authedClient.rpc('register_school');
        rpcError = error;
      } else {
        const { error } = await supabase.rpc('register_school');
        rpcError = error;
      }
      
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
