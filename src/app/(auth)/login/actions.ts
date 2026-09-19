'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Unmask specific errors safely
    if (error.message?.includes('Invalid login credentials')) {
      return { error: 'Invalid email or password.' }
    }
    if (error.message?.includes('Email not confirmed')) {
      return { error: 'Please verify your email address before signing in.' }
    }
    return { error: 'Unable to sign in right now. Please try again.' }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    await supabase.auth.signOut()
    return { error: 'Authentication failed. Please try again.' }
  }

  // 1. Find profile by auth.uid()
  let profile = null;
  const { data: profilesData, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, school_id")
    .eq("id", userData.user.id)
    .limit(1);

  if (profileError) {
    console.error("Profile fetch error:", profileError);
    // Continue instead of failing to see if we can resolve it via RPC or if it's a transient error
  } else if (profilesData && profilesData.length > 0) {
    profile = profilesData[0];
  }

  // Fallback: If profile doesn't exist, this is not an account verification error.
  // It might be an incomplete signup. But we must not duplicate profiles if it exists.
  if (!profile) {
    const { error: rpcError } = await supabase.rpc('register_school');
    if (rpcError) {
      await supabase.auth.signOut();
      if (rpcError.message?.includes('School code already exists')) {
        return { error: 'School code is already in use.' };
      }
      return { error: 'Your account setup is incomplete. Please contact support.' };
    }

    const { data: newProfilesData } = await supabase
      .from("profiles")
      .select("role, is_active, school_id")
      .eq("id", userData.user.id)
      .limit(1);

    if (newProfilesData && newProfilesData.length > 0) {
      profile = newProfilesData[0];
    } else {
      await supabase.auth.signOut();
      return { error: 'Unable to verify account details. Please contact support.' };
    }
  }

  // 2. EvenVibe Admin check
  if (profile.role === 'evenvibe_admin') {
    revalidatePath('/', 'layout');
    redirect('/admin');
  }

  // 3. Verify role = school_admin and school_id exists
  if (profile.role !== 'school_admin' || !profile.school_id) {
    await supabase.auth.signOut();
    return { error: 'Your account lacks the necessary permissions.' };
  }

  // 4. Verify school exists and fetch its is_active status
  const { data: schoolData, error: schoolError } = await supabase
    .from("schools")
    .select("is_active")
    .eq("id", profile.school_id)
    .single();

  if (schoolError || !schoolData) {
    console.error("School fetch error:", schoolError);
    await supabase.auth.signOut();
    return { error: 'School record could not be found. Please contact support.' };
  }

  // 5. If profile.is_active=false OR school.is_active=false -> show pending approval
  if (!profile.is_active || !schoolData.is_active) {
    await supabase.auth.signOut();
    return { error: 'Your school registration is pending EvenVibe admin approval.' };
  }

  // 6. Only when both profile.is_active=true AND school.is_active=true -> redirect to /school
  revalidatePath('/', 'layout');
  redirect('/school');
}

import { signOutAction } from "@/lib/auth/actions";

export async function logout() {
  return signOutAction();
}
