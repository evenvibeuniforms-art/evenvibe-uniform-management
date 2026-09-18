"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";

export async function approveSchool(schoolId: string) {
  try {
    // 1. Verify caller is an admin (server-side authorization)
    await requireAdmin();

    // 2. Validate UUID format (basic regex)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      return { error: "Invalid school identifier." };
    }

    const supabase = await createClient();

    // 3. Call secure approve_school RPC
    const { error } = await supabase.rpc("approve_school", {
      p_school_id: schoolId,
    });

    if (error) {
      console.error("Error approving school:", error);
      return { error: "Failed to approve school. Please try again." };
    }

    // 4. Revalidate the schools page
    revalidatePath("/admin/schools");

    return { success: "School approved successfully." };
  } catch (error) {
    console.error("Approve school exception:", error);
    return { error: "An unexpected error occurred." };
  }
}

export async function rejectSchool(schoolId: string) {
  try {
    // 1. Verify caller is an admin
    await requireAdmin();

    // 2. Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      return { error: "Invalid school identifier." };
    }

    // Note: The current schema handles rejection by keeping the records inactive.
    // In the future, if a rejection status or hard-delete is required, it can be implemented here.
    // For now, this action serves as a placeholder/no-op that confirms the action and refreshes.
    
    // We could add an explicit UPDATE here to ensure is_active is false, just in case,
    // but typically it already is false.
    const supabase = await createClient();
    const { error } = await supabase
      .from("schools")
      .update({ is_active: false })
      .eq("id", schoolId);
      
    if (error) {
      console.error("Error rejecting school:", error);
      return { error: "Failed to process rejection." };
    }

    // 4. Revalidate the schools page
    revalidatePath("/admin/schools");

    return { success: "Registration rejected and remains inactive." };
  } catch (error) {
    console.error("Reject school exception:", error);
    return { error: "An unexpected error occurred." };
  }
}

