"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { profileSchema, passwordSchema } from "./schema";

// ─── Load Profile & School Info ───────────────────────────────────────────────

export async function getProfileAndSchool() {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // Fetch full profile row
    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, school_id, created_at")
      .eq("id", profile.id)
      .single();

    if (profileErr || !profileData) {
      return { success: false, error: "Failed to load profile." };
    }

    // Fetch school row
    const { data: schoolData, error: schoolErr } = await supabase
      .from("schools")
      .select(
        "id, name, school_code, address, city, district, state, pincode, contact_name, contact_email, contact_phone, is_active, created_at"
      )
      .eq("id", profileData.school_id!)
      .single();

    if (schoolErr || !schoolData) {
      return { success: false, error: "Failed to load school information." };
    }

    // Fetch auth email (server-side safe)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return {
      success: true,
      profile: {
        id: profileData.id,
        full_name: profileData.full_name ?? "",
        phone: profileData.phone ?? "",
        email: user?.email ?? "",
        role: profileData.role,
        created_at: profileData.created_at,
      },
      school: schoolData,
    };
  } catch {
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(formData: { fullName: string; phone?: string }) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const parsed = profileSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { fullName, phone } = parsed.data;

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", profile.id);

    if (error) {
      console.error("updateProfile error:", error);
      return { success: false, error: "Failed to update profile. Please try again." };
    }

    revalidatePath("/school/settings");
    revalidatePath("/school", "layout");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ─── Change Password ──────────────────────────────────────────────────────────

export async function changePassword(formData: {
  newPassword: string;
  confirmPassword: string;
}) {
  try {
    // Auth guard first
    await requireSchoolAdmin();
    const supabase = await createClient();

    const parsed = passwordSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { newPassword } = parsed.data;

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("changePassword error:", error);
      if (error.message?.toLowerCase().includes("same password")) {
        return {
          success: false,
          error: "New password must be different from your current password.",
        };
      }
      return { success: false, error: "Failed to update password. Please try again." };
    }

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
