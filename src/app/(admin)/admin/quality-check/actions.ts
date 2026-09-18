"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const startQCSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional(),
});

const updateProgressSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  checkedQty: z.number().int().min(0, "Checked quantity must be a non-negative whole number"),
  passedQty: z.number().int().min(0, "Passed quantity must be a non-negative whole number"),
  defectiveQty: z.number().int().min(0, "Defective quantity must be a non-negative whole number"),
  note: z.string().max(1000, "Note cannot exceed 1000 characters").optional(),
});

const updateRemarksSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters"),
});

const completeQCSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  note: z.string().max(1000, "Note cannot exceed 1000 characters").optional(),
});

export async function startQualityCheck(orderId: string, remarks?: string) {
  try {
    await requireAdmin();

    const parsed = startQCSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("start_quality_check", {
      p_order_id: parsed.data.orderId,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.error("startQualityCheck RPC error:", error);
      return { error: error.message || "Failed to start quality check" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to start quality check" };
    }

    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return { success: true, qcId: data.qc_id, totalQuantity: data.total_quantity };
  } catch (err: unknown) {
    console.error("startQualityCheck unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to start quality check" };
  }
}

export async function updateQualityCheckProgress(
  orderId: string,
  checkedQty: number,
  passedQty: number,
  defectiveQty: number,
  note?: string
) {
  try {
    await requireAdmin();

    const parsed = updateProgressSchema.safeParse({
      orderId,
      checkedQty,
      passedQty,
      defectiveQty,
      note,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    if (parsed.data.passedQty + parsed.data.defectiveQty !== parsed.data.checkedQty) {
      return {
        error: "Passed and defective quantities must equal the checked quantity.",
      };
    }

    const supabase = await createClient();

    // Fetch authoritative QC record to verify total_quantity and status
    const { data: qcRecord, error: fetchErr } = await supabase
      .from("quality_check_records")
      .select("id, status, total_quantity")
      .eq("order_id", parsed.data.orderId)
      .single();

    if (fetchErr || !qcRecord) {
      return { error: "Quality check record not found for this order" };
    }

    if (parsed.data.checkedQty > qcRecord.total_quantity) {
      return {
        error: `Checked quantity (${parsed.data.checkedQty}) cannot exceed total order quantity (${qcRecord.total_quantity})`,
      };
    }

    const { data, error } = await supabase.rpc("update_quality_check_progress", {
      p_order_id: parsed.data.orderId,
      p_checked_quantity: parsed.data.checkedQty,
      p_passed_quantity: parsed.data.passedQty,
      p_defective_quantity: parsed.data.defectiveQty,
      p_note: parsed.data.note?.trim() || null,
    });

    if (error) {
      console.error("updateQualityCheckProgress RPC error:", error);
      return { error: error.message || "Failed to update quality check progress" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to update quality check progress" };
    }

    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      checkedQuantity: data.checked_quantity,
      passedQuantity: data.passed_quantity,
      defectiveQuantity: data.defective_quantity,
    };
  } catch (err: unknown) {
    console.error("updateQualityCheckProgress unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update quality check progress" };
  }
}

export async function updateQualityCheckRemarks(orderId: string, remarks: string) {
  try {
    const profile = await requireAdmin();

    const parsed = updateRemarksSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const trimmed = parsed.data.remarks.trim();

    // Fetch existing QC record
    const { data: qcRecord, error: fetchErr } = await supabase
      .from("quality_check_records")
      .select("id, status, remarks")
      .eq("order_id", parsed.data.orderId)
      .single();

    if (fetchErr || !qcRecord) {
      return { error: "Quality check record not found for this order" };
    }

    const { error: updateErr } = await supabase
      .from("quality_check_records")
      .update({
        remarks: trimmed || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", qcRecord.id);

    if (updateErr) {
      console.error("updateQualityCheckRemarks update error:", updateErr);
      return { error: "Failed to update remarks" };
    }

    // Insert history entry for remark update
    if (trimmed) {
      await supabase.from("quality_check_history").insert({
        quality_check_id: qcRecord.id,
        order_id: parsed.data.orderId,
        from_status: qcRecord.status,
        to_status: qcRecord.status,
        note: `Remarks updated: ${trimmed}`,
        changed_by: profile.id,
      });
    }

    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);

    return { success: true, remarks: trimmed };
  } catch (err: unknown) {
    console.error("updateQualityCheckRemarks unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update remarks" };
  }
}

export async function completeQualityCheck(orderId: string, note?: string) {
  try {
    await requireAdmin();

    const parsed = completeQCSchema.safeParse({ orderId, note });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_quality_check", {
      p_order_id: parsed.data.orderId,
      p_resolution_note: parsed.data.note?.trim() || null,
    });

    if (error) {
      console.error("completeQualityCheck RPC error:", error);
      return { error: error.message || "Failed to complete quality check" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to complete quality check" };
    }

    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      status: data.status,
      passedQuantity: data.passed_quantity,
      defectiveQuantity: data.defective_quantity,
    };
  } catch (err: unknown) {
    console.error("completeQualityCheck unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete quality check" };
  }
}
