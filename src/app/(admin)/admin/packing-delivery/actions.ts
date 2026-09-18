"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const startPackingSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional(),
});

const updateProgressSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  packedQty: z.number().int().min(0, "Packed quantity must be a non-negative whole number"),
  note: z.string().max(1000, "Note cannot exceed 1000 characters").optional(),
});

const updateChecklistItemSchema = z.object({
  packingRecordId: z.string().uuid("Invalid packing record ID"),
  itemKey: z.enum([
    "quantity_verified",
    "items_packed",
    "labels_attached",
    "order_details_verified",
    "packaging_completed",
  ], { message: "Invalid checklist item key" }),
  isCompleted: z.boolean(),
});

const updateRemarksSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters"),
});

const completePackingSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional(),
});

const dispatchOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  courierName: z.string().min(1, "Courier name is required").max(100, "Courier name too long"),
  trackingNumber: z.string().min(1, "Tracking number is required").max(100, "Tracking number too long"),
  estimatedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Estimated delivery must be a valid date (YYYY-MM-DD)"),
});

const transitDeliveredSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  note: z.string().max(1000, "Note cannot exceed 1000 characters").optional(),
});

export async function startPacking(orderId: string, remarks?: string) {
  try {
    await requireAdmin();

    const parsed = startPackingSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("start_packing", {
      p_order_id: parsed.data.orderId,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.error("startPacking RPC error:", error);
      return { error: error.message || "Failed to start packing" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to start packing" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return { success: true, packingRecordId: data.packing_record_id, totalQuantity: data.total_quantity };
  } catch (err: unknown) {
    console.error("startPacking unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to start packing" };
  }
}

export async function updatePackingProgress(orderId: string, packedQty: number, note?: string) {
  try {
    await requireAdmin();

    const parsed = updateProgressSchema.safeParse({
      orderId,
      packedQty,
      note,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("update_packing_progress", {
      p_order_id: parsed.data.orderId,
      p_packed_quantity: parsed.data.packedQty,
      p_note: parsed.data.note?.trim() || null,
    });

    if (error) {
      console.error("updatePackingProgress RPC error:", error);
      return { error: error.message || "Failed to update packing progress" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to update packing progress" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);

    return {
      success: true,
      packedQuantity: data.packed_quantity,
      totalQuantity: data.total_quantity,
    };
  } catch (err: unknown) {
    console.error("updatePackingProgress unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update packing progress" };
  }
}

export async function updatePackingChecklistItem(
  packingRecordId: string,
  itemKey: string,
  isCompleted: boolean
) {
  try {
    await requireAdmin();

    const parsed = updateChecklistItemSchema.safeParse({
      packingRecordId,
      itemKey,
      isCompleted,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("update_packing_checklist_item", {
      p_packing_record_id: parsed.data.packingRecordId,
      p_item_key: parsed.data.itemKey,
      p_is_completed: parsed.data.isCompleted,
    });

    if (error) {
      console.error("updatePackingChecklistItem RPC error:", error);
      return { error: error.message || "Failed to update checklist item" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to update checklist item" };
    }

    revalidatePath("/admin/packing-delivery");

    return {
      success: true,
      itemKey: data.item_key,
      isCompleted: data.is_completed,
    };
  } catch (err: unknown) {
    console.error("updatePackingChecklistItem unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update checklist item" };
  }
}

export async function updatePackingRemarks(orderId: string, remarks: string) {
  try {
    const profile = await requireAdmin();

    const parsed = updateRemarksSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();
    const trimmed = parsed.data.remarks.trim();

    // Fetch existing packing record
    const { data: packingRecord, error: fetchErr } = await supabase
      .from("packing_records")
      .select("id, status, remarks")
      .eq("order_id", parsed.data.orderId)
      .single();

    if (fetchErr || !packingRecord) {
      return { error: "Packing record not found for this order" };
    }

    const { error: updateErr } = await supabase
      .from("packing_records")
      .update({
        remarks: trimmed || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", packingRecord.id);

    if (updateErr) {
      console.error("updatePackingRemarks update error:", updateErr);
      return { error: "Failed to update remarks" };
    }

    if (trimmed) {
      await supabase.from("packing_history").insert({
        packing_record_id: packingRecord.id,
        order_id: parsed.data.orderId,
        from_status: packingRecord.status,
        to_status: packingRecord.status,
        note: `Remarks updated: ${trimmed}`,
        changed_by: profile.id,
      });
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);

    return { success: true, remarks: trimmed };
  } catch (err: unknown) {
    console.error("updatePackingRemarks unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update remarks" };
  }
}

export async function completePacking(orderId: string, remarks?: string) {
  try {
    await requireAdmin();

    const parsed = completePackingSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_packing", {
      p_order_id: parsed.data.orderId,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.error("completePacking RPC error:", error);
      return { error: error.message || "Failed to complete packing" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to complete packing" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      status: data.status,
      packedQuantity: data.packed_quantity,
      totalQuantity: data.total_quantity,
    };
  } catch (err: unknown) {
    console.error("completePacking unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete packing" };
  }
}

export async function dispatchOrder(
  orderId: string,
  courierName: string,
  trackingNumber: string,
  estimatedDelivery: string
) {
  try {
    await requireAdmin();

    const parsed = dispatchOrderSchema.safeParse({
      orderId,
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim(),
      estimatedDelivery: estimatedDelivery.trim(),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("dispatch_order", {
      p_order_id: parsed.data.orderId,
      p_courier_name: parsed.data.courierName,
      p_tracking_number: parsed.data.trackingNumber,
      p_estimated_delivery: parsed.data.estimatedDelivery,
    });

    if (error) {
      console.error("dispatchOrder RPC error:", error);
      return { error: error.message || "Failed to dispatch order" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to dispatch order" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return {
      success: true,
      status: data.status,
      courierName: data.courier_name,
      trackingNumber: data.tracking_number,
      estimatedDelivery: data.estimated_delivery,
      shippedAt: data.shipped_at,
    };
  } catch (err: unknown) {
    console.error("dispatchOrder unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to dispatch order" };
  }
}

export async function markOrderInTransit(orderId: string, note?: string) {
  try {
    await requireAdmin();

    const parsed = transitDeliveredSchema.safeParse({ orderId, note });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("mark_order_in_transit", {
      p_order_id: parsed.data.orderId,
      p_note: parsed.data.note?.trim() || null,
    });

    if (error) {
      console.error("markOrderInTransit RPC error:", error);
      return { error: error.message || "Failed to mark order in transit" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to mark order in transit" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return {
      success: true,
      status: data.status,
    };
  } catch (err: unknown) {
    console.error("markOrderInTransit unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to mark order in transit" };
  }
}

export async function markOrderDelivered(orderId: string, note?: string) {
  try {
    await requireAdmin();

    const parsed = transitDeliveredSchema.safeParse({ orderId, note });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("mark_order_delivered", {
      p_order_id: parsed.data.orderId,
      p_note: parsed.data.note?.trim() || null,
    });

    if (error) {
      console.error("markOrderDelivered RPC error:", error);
      return { error: error.message || "Failed to mark order as delivered" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to mark order as delivered" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);
    revalidatePath("/school/requirements");
    revalidatePath("/school");

    return {
      success: true,
      status: data.status,
      deliveredAt: data.delivered_at,
    };
  } catch (err: unknown) {
    console.error("markOrderDelivered unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to mark order as delivered" };
  }
}
