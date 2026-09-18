"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export type RequirementPreview = {
  totalStudents: number;
  completedSizes: number;
  pendingSizes: number;
  completionPercentage: number;
  quantities: {
    Male: Record<string, Record<string, number>>;
    Female: Record<string, Record<string, number>>;
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
    // Active orders are in-flight (not delivered or cancelled).
    const ACTIVE_ORDER_STATUSES = [
      "submitted",
      "under_review",
      "confirmed",
      "production",
      "quality_check",
      "packed",
      "dispatched",
      "in_transit",
    ];

    const { data: activeOrders, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, status, requirement_id, requirements(id, requirement_number, status)")
      .eq("school_id", profile.school_id)
      .in("status", ACTIVE_ORDER_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);

    if (orderError) throw orderError;

    let hasActiveRequirement = false;
    let activeRequirementStatus: string | null = null;
    let activeRequirementNumber: string | null = null;
    let activeOrderNumber: string | null = null;

    if (activeOrders && activeOrders.length > 0) {
      const activeOrder = activeOrders[0];
      hasActiveRequirement = true;
      activeOrderNumber = activeOrder.order_number;
      activeRequirementStatus = activeOrder.status;
      const reqObj = Array.isArray(activeOrder.requirements)
        ? (activeOrder.requirements[0] as { requirement_number?: string } | undefined)
        : (activeOrder.requirements as { requirement_number?: string } | null);
      activeRequirementNumber = reqObj?.requirement_number || null;
    } else {
      // Check for unlinked active requirements without orders or with in-flight orders
      const { data: unlinkedReqs, error: reqError } = await supabase
        .from("requirements")
        .select("id, status, requirement_number, orders(id, status)")
        .eq("school_id", profile.school_id)
        .in("status", ["draft", "submitted", "under_review", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (reqError) throw reqError;

      if (unlinkedReqs && unlinkedReqs.length > 0) {
        const req = unlinkedReqs[0];
        const linkedOrders = Array.isArray(req.orders) ? req.orders : (req.orders ? [req.orders] : []);
        const hasTerminalOrder = linkedOrders.length > 0 && linkedOrders.every((o: { status: string }) => o.status === "delivered" || o.status === "cancelled");
        if (!hasTerminalOrder) {
          hasActiveRequirement = true;
          activeRequirementStatus = req.status;
          activeRequirementNumber = req.requirement_number;
        }
      }
    }

    // 2. Fetch total students count
    const { data: students, error: studError } = await supabase
      .from("students")
      .select(`
        id, class_name, gender,
        student_uniform_sizes (dynamic_sizes, is_complete)
      `)
      .eq("school_id", profile.school_id);

    if (studError) throw studError;

    const totalStudents = students?.length || 0;
    let completedSizes = 0;
    const { data: configs } = await supabase
      .from("school_uniform_configurations")
      .select(`
        gender,
        items:school_uniform_configuration_items(id, item_name)
      `)
      .eq("school_id", profile.school_id);

    const configMap: Record<string, { gender: string, item_name: string }> = {};
    configs?.forEach(c => {
      if (c.items) {
        c.items.forEach((item: { id: string, item_name: string }) => {
          configMap[item.id] = { gender: c.gender, item_name: item.item_name };
        });
      }
    });

    const quantities: RequirementPreview["quantities"] = {
      Male: {},
      Female: {}
    };

    const classSummaryMap: Record<string, { total: number; completed: number; pending: number }> = {};

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

        const ds = record.dynamic_sizes || {};
        for (const [itemId, size] of Object.entries(ds)) {
          if (!size) continue;
          const mapped = configMap[itemId];
          if (mapped) {
            const { gender, item_name } = mapped;
            const g = gender as "Male" | "Female";
            if (!quantities[g][item_name]) {
              quantities[g][item_name] = {};
            }
            quantities[g][item_name][size as string] = (quantities[g][item_name][size as string] || 0) + 1;
          }
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

export async function submitRequirement(selectedStudentIds?: string[]): Promise<{ success: boolean; requirementId?: string; error?: string }> {
  try {
    await requireSchoolAdmin();
    const supabase = await createClient();

    if (selectedStudentIds && selectedStudentIds.length === 0) {
      return { success: false, error: "Please select at least one student for this order." };
    }

    // Call the Postgres RPC
    const { data, error } = await supabase.rpc("submit_requirement", {
      p_student_ids: selectedStudentIds && selectedStudentIds.length > 0 ? selectedStudentIds : null,
    });

    if (error) {
      console.error("RPC submit_requirement error:", error);
      return { success: false, error: error.message };
    }

    if (data && data.success) {
      revalidatePath("/school");
      revalidatePath("/school/requirements");
      revalidatePath("/school/orders");
      revalidatePath("/admin/orders");
      return { success: true, requirementId: data.requirement_id };
    } else {
      return { success: false, error: data?.error || "Unknown error occurred during submission." };
    }

  } catch (err) {
    console.error("Error in submitRequirement:", err);
    return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
