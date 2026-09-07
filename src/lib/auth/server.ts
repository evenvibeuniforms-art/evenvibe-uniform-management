import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppRole } from "@/types/database";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }
  
  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, school_id, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return profile;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    redirect("/unauthorized");
  }

  if (!allowedRoles.includes(profile.role as AppRole)) {
    // If they have a valid role but are trying to access the wrong area, redirect them safely
    if (profile.role === "evenvibe_admin") {
      redirect("/admin");
    } else if (profile.role === "school_admin" && profile.school_id) {
      redirect("/school");
    } else {
      redirect("/unauthorized");
    }
  }

  // Additional check: School admin must have a school_id
  if (profile.role === "school_admin" && !profile.school_id) {
    redirect("/unauthorized");
  }

  return profile;
}

export async function requireAdmin() {
  return requireRole(["evenvibe_admin"]);
}

export async function requireSchoolAdmin() {
  return requireRole(["school_admin"]);
}
