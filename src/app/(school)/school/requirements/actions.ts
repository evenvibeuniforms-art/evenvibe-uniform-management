"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export type RequirementPreview = {
  totalStudents: number;
  completedSizes: number;
  pendingSizes: number;
  completionPercentage: number;
  regularStudents: number;
  tshirtStudents: number;
  quantities: {
    regular: {
      shirt: Record<string, number>;
      pant: Record<string, number>;
      short: Record<string, number>;
    };
    tshirt: {
      tshirt: Record<string, number>;
      pant: Record<string, number>;
      short: Record<string, number>;
    };
  };
  classSummary: Array<{
    className: string;
    total: number;
    completed: number;
    pending: number;
  }>;
  hasActiveRequirement: boolean;
  activeRequirementStatus: string | null;
  activeRequirementNumber: string | null;
  activeOrderNumber: string | null;
};

export async function getRequirementPreview(): Promise<{ preview: RequirementPreview | null; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Check for active requirements and orders
    const { data: requirements, error: reqError } = await supabase
      .from("requirements")
      .select("status, requirement_number, orders(order_number)")
      .eq("school_id", profile.school_id)
      .in("status", ["submitted", "under_review", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (reqError) throw reqError;

    const hasActiveRequirement = requirements && requirements.length > 0;
    const activeRequirementStatus = hasActiveRequirement ? requirements[0].status : null;
    const activeRequirementNumber = hasActiveRequirement ? requirements[0].requirement_number : null;
    let activeOrderNumber = null;
    
    if (hasActiveRequirement && requirements[0].orders && requirements[0].orders.length > 0) {
      activeOrderNumber = (requirements[0].orders[0] as { order_number: string }).order_number;
    }

    // 2. Fetch total students count
    const { data: students, error: studError } = await supabase
      .from("students")
      .select(`
        id, class_name,
        student_uniform_sizes (uniform_type, shirt_size, tshirt_size, pant_size, short_size, is_complete)
      `)
      .eq("school_id", profile.school_id);

    if (studError) throw studError;

    const totalStudents = students?.length || 0;
    let completedSizes = 0;
    let regularStudents = 0;
    let tshirtStudents = 0;

    const classSummaryMap: Record<string, { total: number; completed: number; pending: number }> = {};
    const quantities = {
      regular: { shirt: {} as Record<string, number>, pant: {} as Record<string, number>, short: {} as Record<string, number> },
      tshirt: { tshirt: {} as Record<string, number>, pant: {} as Record<string, number>, short: {} as Record<string, number> },
    };

    students?.forEach(student => {
      const cls = student.class_name || "Unassigned";
      if (!classSummaryMap[cls]) {
        classSummaryMap[cls] = { total: 0, completed: 0, pending: 0 };
      }
      classSummaryMap[cls].total++;

      const record = Array.isArray(student.student_uniform_sizes) ? student.student_uniform_sizes[0] : student.student_uniform_sizes;

      if (record && record.is_complete) {
        completedSizes++;
        classSummaryMap[cls].completed++;

        if (record.uniform_type === "regular") {
          regularStudents++;
          if (record.shirt_size) quantities.regular.shirt[record.shirt_size] = (quantities.regular.shirt[record.shirt_size] || 0) + 1;
          if (record.pant_size) quantities.regular.pant[record.pant_size] = (quantities.regular.pant[record.pant_size] || 0) + 1;
          if (record.short_size) quantities.regular.short[record.short_size] = (quantities.regular.short[record.short_size] || 0) + 1;
        } else if (record.uniform_type === "tshirt") {
          tshirtStudents++;
          if (record.tshirt_size) quantities.tshirt.tshirt[record.tshirt_size] = (quantities.tshirt.tshirt[record.tshirt_size] || 0) + 1;
          if (record.pant_size) quantities.tshirt.pant[record.pant_size] = (quantities.tshirt.pant[record.pant_size] || 0) + 1;
          if (record.short_size) quantities.tshirt.short[record.short_size] = (quantities.tshirt.short[record.short_size] || 0) + 1;
        }
      } else {
        classSummaryMap[cls].pending++;
      }
    });

    const pendingSizes = totalStudents - completedSizes;
    const completionPercentage = totalStudents > 0 ? Math.round((completedSizes / totalStudents) * 100) : 0;

    const classSummary = Object.entries(classSummaryMap).map(([className, data]) => ({
      className,
      ...data,
    })).sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

    return {
      preview: {
        totalStudents,
        completedSizes,
        pendingSizes,
        completionPercentage,
        regularStudents,
        tshirtStudents,
        quantities,
        classSummary,
        hasActiveRequirement,
        activeRequirementStatus,
        activeRequirementNumber,
        activeOrderNumber,
      }
    };
  } catch (err) {
    console.error("Error generating requirement preview:", err);
    return { error: err instanceof Error ? err.message : "Failed to load preview.", preview: null };
  }
}

export async function submitRequirement(): Promise<{ success: boolean; requirementId?: string; error?: string }> {
  try {
    await requireSchoolAdmin();
    const supabase = await createClient();

    // Call the Postgres RPC
    const { data, error } = await supabase.rpc("submit_requirement");

    if (error) {
      console.error("RPC submit_requirement error:", error);
      return { success: false, error: error.message };
    }

    if (data && data.success) {
      revalidatePath("/school");
      revalidatePath("/school/requirements");
      return { success: true, requirementId: data.requirement_id };
    } else {
      return { success: false, error: data?.error || "Unknown error occurred during submission." };
    }

  } catch (err) {
    console.error("Error in submitRequirement:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
