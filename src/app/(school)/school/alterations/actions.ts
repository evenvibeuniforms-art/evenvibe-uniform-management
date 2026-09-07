"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { alterationFormSchema, AlterationFormValues } from "./schema";

export async function submitAlteration(data: AlterationFormValues) {
  try {
    await requireSchoolAdmin();
    const supabase = await createClient();

    // Validate using Zod
    const parsedData = alterationFormSchema.safeParse(data);
    if (!parsedData.success) {
      return { success: false, error: "Invalid form data" };
    }

    const { studentId, uniformType, itemType, issueType, description, orderId } = parsedData.data;

    // Call Postgres RPC
    const { data: rpcData, error } = await supabase.rpc("submit_alteration_request", {
      p_student_id: studentId,
      p_uniform_type: uniformType,
      p_item_type: itemType,
      p_issue_type: issueType,
      p_description: description,
      p_order_id: orderId || null,
    });

    if (error) {
      console.error("RPC submit_alteration_request error:", error);
      return { success: false, error: error.message };
    }

    if (rpcData && rpcData.success) {
      revalidatePath("/school/alterations");
      return { success: true, id: rpcData.alteration_request_id, request_number: rpcData.request_number };
    } else {
      return { success: false, error: rpcData?.error || "Unknown error occurred" };
    }
  } catch (err) {
    console.error("Error submitting alteration:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getAlterationsSummary() {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // Let's get counts via RPC or direct grouping since RLS protects it.
    // For simplicity, we just select statuses and group in JS.
    const { data, error } = await supabase
      .from("alteration_requests")
      .select("status")
      .eq("school_id", profile.school_id);

    if (error) throw error;

    const summary = {
      total: data.length,
      requested: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      rework: 0,
      completed: 0,
    };

    data.forEach((row) => {
      if (row.status in summary) {
        summary[row.status as keyof typeof summary]++;
      }
    });

    return { success: true, summary };
  } catch (err) {
    console.error("Error getting summary:", JSON.stringify(err, null, 2), "Original err:", err);
    return { success: false, error: "Failed to get summary", summary: null };
  }
}

export async function searchStudents(query: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Check if the school has any delivered orders
    const { data: deliveredOrders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, order_number, status, created_at")
      .eq("school_id", profile.school_id)
      .eq("status", "delivered")
      .order("created_at", { ascending: false });

    if (ordersErr) throw ordersErr;

    const hasDeliveredOrders = deliveredOrders && deliveredOrders.length > 0;
    const formattedOrders = (deliveredOrders || []).map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
    }));

    if (!hasDeliveredOrders) {
      return {
        success: true,
        hasDeliveredOrders: false,
        students: [],
        deliveredOrders: [],
      };
    }

    const trimmed = query.trim();
    let studentQuery = supabase
      .from("students")
      .select("id, full_name, class_name, section, roll_number")
      .eq("school_id", profile.school_id);

    if (trimmed) {
      const ilikeQuery = `%${trimmed}%`;
      studentQuery = studentQuery.or(
        `full_name.ilike.${ilikeQuery},class_name.ilike.${ilikeQuery},section.ilike.${ilikeQuery},roll_number.ilike.${ilikeQuery}`
      );
    }

    const { data, error } = await studentQuery
      .order("class_name", { ascending: true })
      .order("section", { ascending: true })
      .order("roll_number", { ascending: true })
      .limit(20);

    if (error) throw error;

    return {
      success: true,
      hasDeliveredOrders: true,
      students: data || [],
      deliveredOrders: formattedOrders,
    };
  } catch (err) {
    console.error("Error searching students:", err);
    return {
      success: false,
      hasDeliveredOrders: false,
      students: [],
      deliveredOrders: [],
      error: "Failed to search students",
    };
  }
}

