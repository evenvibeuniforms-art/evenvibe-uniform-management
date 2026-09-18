"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export async function startProduction(orderId: string, initialRemarks?: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Call atomic RPC
    const { data, error } = await supabase.rpc("start_production", {
      p_order_id: orderId,
      p_remarks: initialRemarks?.trim() || null,
    });

    if (error) {
      console.error("startProduction RPC error:", error);
      return { error: error.message || "Failed to start production" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to start production" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return { success: true, totalQuantity: data.total_quantity };
  } catch (err: unknown) {
    console.error("startProduction unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to start production" };
  }
}

export async function updateProductionStage(
  orderId: string,
  nextStage: string,
  note?: string
) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Call atomic RPC
    const { data, error } = await supabase.rpc("advance_production_stage", {
      p_order_id: orderId,
      p_next_stage: nextStage,
      p_note: note?.trim() || null,
    });

    if (error) {
      console.error("advance_production_stage RPC error:", error);
      return { error: error.message || "Failed to advance production stage" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to advance production stage" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return { success: true, stage: data.new_stage };
  } catch (err: unknown) {
    console.error("updateProductionStage unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to advance stage" };
  }
}

export async function updateProductionQuantity(
  orderId: string,
  completedQuantity: number,
  remarks?: string
) {
  try {
    const profile = await requireAdmin();
    const supabase = await createClient();

    if (!Number.isInteger(completedQuantity) || completedQuantity < 0) {
      return { error: "Completed quantity must be a non-negative whole number" };
    }

    // Fetch existing production record
    const { data: prodRecord, error: fetchErr } = await supabase
      .from("production_records")
      .select("id, total_quantity, completed_quantity, stage, remarks")
      .eq("order_id", orderId)
      .single();

    if (fetchErr || !prodRecord) {
      return { error: "Production record not found" };
    }

    if (completedQuantity > prodRecord.total_quantity) {
      return {
        error: `Completed quantity (${completedQuantity}) cannot exceed total quantity (${prodRecord.total_quantity})`,
      };
    }

    const newRemarks = remarks !== undefined ? (remarks.trim() || null) : prodRecord.remarks;

    const { error: updateErr } = await supabase
      .from("production_records")
      .update({
        completed_quantity: completedQuantity,
        remarks: newRemarks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prodRecord.id);

    if (updateErr) {
      console.error("updateProductionQuantity update error:", updateErr);
      return { error: "Failed to update production quantity" };
    }

    // Insert history entry for quantity milestone
    const historyNote = `Completed quantity updated to ${completedQuantity}/${prodRecord.total_quantity}${remarks ? ` — Note: ${remarks}` : ""}`;
    await supabase.from("production_stage_history").insert({
      production_record_id: prodRecord.id,
      order_id: orderId,
      from_stage: prodRecord.stage,
      to_stage: prodRecord.stage,
      note: historyNote,
      changed_by: profile.id,
    });

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true, completedQuantity };
  } catch (err: unknown) {
    console.error("updateProductionQuantity unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update quantity" };
  }
}

export async function updateProductionRemarks(orderId: string, remarks: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const trimmed = remarks.trim();
    if (trimmed.length > 1000) {
      return { error: "Remarks cannot exceed 1000 characters" };
    }

    const { error: updateErr } = await supabase
      .from("production_records")
      .update({
        remarks: trimmed || null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    if (updateErr) {
      console.error("updateProductionRemarks error:", updateErr);
      return { error: "Failed to update remarks" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true };
  } catch (err: unknown) {
    console.error("updateProductionRemarks error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update remarks" };
  }
}
