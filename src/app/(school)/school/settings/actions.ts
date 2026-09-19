"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin, getCurrentUser } from "@/lib/auth/server";
import { profileSchema, passwordSchema } from "./schema";

// ─── Load Profile & School Info ───────────────────────────────────────────────

export async function getProfileAndSchool() {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // Fetch full profile, school, and user concurrently
    const [
      { data: profileData, error: profileErr },
      { data: schoolData, error: schoolErr },
      user
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, role, school_id, created_at")
        .eq("id", profile.id)
        .single(),
      supabase
        .from("schools")
        .select(
          "id, name, school_code, address, city, district, state, pincode, contact_name, contact_email, contact_phone, is_active, created_at"
        )
        .eq("id", profile.school_id!)
        .single(),
      getCurrentUser(),
    ]);

    if (profileErr || !profileData) {
      return { success: false, error: "Failed to load profile." };
    }

    if (schoolErr || !schoolData) {
      return { success: false, error: "Failed to load school information." };
    }

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

import { signOutAction } from "@/lib/auth/actions";

export async function logoutAction() {
  return signOutAction();
}

// ─── Update School Info ────────────────────────────────────────────────────────

import { schoolInfoSchema } from "./schema";

export async function updateSchoolInfo(formData: {
  address?: string;
  city?: string;
  district?: string;
  pincode?: string;
  contact_name?: string;
  contact_phone?: string;
}) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const parsed = schoolInfoSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { error } = await supabase
      .from("schools")
      .update({
        address: parsed.data.address || null,
        city: parsed.data.city || null,
        district: parsed.data.district || null,
        pincode: parsed.data.pincode || null,
        contact_name: parsed.data.contact_name || null,
        contact_phone: parsed.data.contact_phone || null,
      })
      .eq("id", profile.school_id);

    if (error) {
      console.error("updateSchoolInfo error:", error);
      return { success: false, error: "Failed to update school information. Please try again." };
    }

    revalidatePath("/school/settings");
    revalidatePath("/school", "layout");

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
