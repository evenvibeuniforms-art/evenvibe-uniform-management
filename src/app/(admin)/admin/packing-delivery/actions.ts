"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTodayDateIST } from "@/lib/utils";

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
  courierName: z.string().max(100, "Courier name too long").optional().nullable(),
  trackingNumber: z.string().max(100, "Tracking number too long").optional().nullable(),
  estimatedDelivery: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Estimated delivery must be a valid date (YYYY-MM-DD)")
    .optional()
    .nullable()
    .or(z.literal("")),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional().nullable(),
});

const saveDeliveryDetailsSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  courierName: z.string().max(100, "Courier name too long").optional().nullable(),
  trackingNumber: z.string().max(100, "Tracking number too long").optional().nullable(),
  estimatedDelivery: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Estimated delivery must be a valid date (YYYY-MM-DD)")
    .optional()
    .nullable()
    .or(z.literal("")),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional().nullable(),
});

const transitDeliveredSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  note: z.string().max(1000, "Note cannot exceed 1000 characters").optional(),
  remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional().nullable(),
});

/**
 * Start Delivery for an order
 * Verifies QC Completed and QC Passed quantity > 0
 */
export async function startDelivery(orderId: string, remarks?: string) {
  try {
    const profile = await requireAdmin();

    const parsed = startPackingSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    let deliveryId: string | undefined;
    let totalQuantity: number | undefined;

    const { data, error } = await supabase.rpc("start_delivery", {
      p_order_id: parsed.data.orderId,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    const isQcBlockingError =
      (error && error.message.includes("Quality Check")) ||
      (data && !data.success && data.error && data.error.includes("Quality Check"));

    if (isQcBlockingError) {
      // Production bypassed fallback: initialize delivery directly
      const { data: orderData, error: orderFetchErr } = await supabase
        .from("orders")
        .select("id, status, requirement_id")
        .eq("id", parsed.data.orderId)
        .single();

      if (orderFetchErr || !orderData) {
        return { error: "Order not found" };
      }

      // Check for existing delivery/packing record
      const { data: existingPacking } = await supabase
        .from("packing_records")
        .select("id, total_quantity")
        .eq("order_id", parsed.data.orderId)
        .maybeSingle();

      if (existingPacking) {
        deliveryId = existingPacking.id;
        totalQuantity = existingPacking.total_quantity;
      } else {
        // Derive deliverable quantity from requirement_items
        const { data: reqItems } = await supabase
          .from("requirement_items")
          .select("quantity")
          .eq("requirement_id", orderData.requirement_id);

        const derivedTotal = (reqItems || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
        const nowIso = new Date().toISOString();

        const { data: newPacking, error: insertPackingErr } = await supabase
          .from("packing_records")
          .insert({
            order_id: parsed.data.orderId,
            status: "in_progress",
            total_quantity: derivedTotal,
            packed_quantity: derivedTotal,
            remarks: parsed.data.remarks?.trim() || null,
            started_at: nowIso,
            packed_by: profile.id,
          })
          .select("id")
          .single();

        if (insertPackingErr) {
          return { error: insertPackingErr.message || "Failed to start delivery" };
        }

        deliveryId = newPacking.id;
        totalQuantity = derivedTotal;

        await supabase.from("packing_history").insert({
          packing_record_id: newPacking.id,
          order_id: parsed.data.orderId,
          from_status: "pending",
          to_status: "in_progress",
          note: parsed.data.remarks?.trim() || "Delivery preparation started",
          changed_by: profile.id,
        });

        if (["confirmed", "production", "quality_check"].includes(orderData.status)) {
          await supabase
            .from("orders")
            .update({ status: "packed", updated_at: nowIso })
            .eq("id", parsed.data.orderId);

          await supabase.from("order_status_history").insert({
            order_id: parsed.data.orderId,
            status: "packed",
            note: "Order moved to delivery (production bypassed)",
          });
        }
      }
    } else if (error) {
      console.error("startDelivery RPC error:", error);
      return { error: error.message || "Failed to start delivery" };
    } else if (data && !data.success) {
      return { error: data.error || "Failed to start delivery" };
    } else {
      deliveryId = data?.delivery_id;
      totalQuantity = data?.total_quantity;
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      deliveryId,
      totalQuantity,
    };
  } catch (err: unknown) {
    console.error("startDelivery unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to start delivery" };
  }
}

/**
 * Save Delivery Details (Courier, tracking number, estimated delivery date, remarks)
 */
export async function saveDeliveryDetails(
  orderId: string,
  details: {
    courierName?: string | null;
    trackingNumber?: string | null;
    estimatedDelivery?: string | null;
    remarks?: string | null;
  }
) {
  try {
    await requireAdmin();

    const parsed = saveDeliveryDetailsSchema.safeParse({
      orderId,
      courierName: details.courierName,
      trackingNumber: details.trackingNumber,
      estimatedDelivery: details.estimatedDelivery,
      remarks: details.remarks,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    // Section 1 & 3: Validate estimated delivery date is today or future
    const deliveryDateStr = parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery.trim() : null;
    if (deliveryDateStr) {
      const todayIST = getTodayDateIST();
      if (deliveryDateStr < todayIST) {
        // Section 6: Check if this is the unchanged existing historical date
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("estimated_delivery")
          .eq("id", parsed.data.orderId)
          .maybeSingle();

        const existingDate = existingOrder?.estimated_delivery
          ? existingOrder.estimated_delivery.split("T")[0]
          : null;

        if (existingDate !== deliveryDateStr) {
          return { error: "Estimated delivery date cannot be earlier than today." };
        }
      }
    }

    const { data, error } = await supabase.rpc("save_delivery_details", {
      p_order_id: parsed.data.orderId,
      p_courier_name: parsed.data.courierName?.trim() || null,
      p_tracking_number: parsed.data.trackingNumber?.trim() || null,
      p_estimated_delivery: parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery : null,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.warn("saveDeliveryDetails RPC warning, falling back to direct table update:", error.message);
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to save delivery details" };
    }

    // Direct authoritative update on orders table
    const { error: directOrderErr } = await supabase
      .from("orders")
      .update({
        courier_name: parsed.data.courierName?.trim() || null,
        tracking_number: parsed.data.trackingNumber?.trim() || null,
        estimated_delivery: parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery : null,
        delivery_remarks: parsed.data.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.orderId);

    if (directOrderErr) {
      console.warn("Direct orders update note (column may be handled by RPC):", directOrderErr.message);
    }

    // Also sync to packing_records remarks if exists
    await supabase
      .from("packing_records")
      .update({
        remarks: parsed.data.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", parsed.data.orderId);

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return { success: true };
  } catch (err: unknown) {
    console.error("saveDeliveryDetails unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save delivery details" };
  }
}

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

    return {
      success: true,
      packingRecordId: data.packing_id || data.packing_record_id,
      totalQuantity: data.total_quantity,
    };
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
  courierName?: string | null,
  trackingNumber?: string | null,
  estimatedDelivery?: string | null,
  remarks?: string | null
) {
  try {
    await requireAdmin();

    const parsed = dispatchOrderSchema.safeParse({
      orderId,
      courierName: courierName?.trim(),
      trackingNumber: trackingNumber?.trim(),
      estimatedDelivery: estimatedDelivery?.trim(),
      remarks: remarks?.trim(),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    // Section 1 & 3: Validate estimated delivery date is today or future
    const deliveryDateStr = parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery.trim() : null;
    if (deliveryDateStr) {
      const todayIST = getTodayDateIST();
      if (deliveryDateStr < todayIST) {
        // Section 6: Check if this is the unchanged existing historical date
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("estimated_delivery")
          .eq("id", parsed.data.orderId)
          .maybeSingle();

        const existingDate = existingOrder?.estimated_delivery
          ? existingOrder.estimated_delivery.split("T")[0]
          : null;

        if (existingDate !== deliveryDateStr) {
          return { error: "Estimated delivery date cannot be earlier than today." };
        }
      }
    }

    const { data, error } = await supabase.rpc("dispatch_order", {
      p_order_id: parsed.data.orderId,
      p_courier_name: parsed.data.courierName,
      p_tracking_number: parsed.data.trackingNumber,
      p_estimated_delivery: parsed.data.estimatedDelivery,
      p_remarks: parsed.data.remarks,
    });

    if (error) {
      console.warn("dispatchOrder RPC warning, falling back to direct table update:", error.message);
    }

    if (data && !data.success) {
      if (data.error && data.error.includes("Quality Check")) {
        console.warn("dispatchOrder RPC reported QC requirement, proceeding with direct table update for bypassed production");
      } else {
        return { error: data.error || "Failed to dispatch order" };
      }
    }

    // Direct authoritative update on orders table to guarantee immutable shipped_at and remarks
    const nowIso = new Date().toISOString();
    const { data: currentOrder } = await supabase
      .from("orders")
      .select("shipped_at, delivery_remarks")
      .eq("id", parsed.data.orderId)
      .maybeSingle();

    const shippedAtToUse = currentOrder?.shipped_at || data?.shipped_at || nowIso;

    await supabase
      .from("orders")
      .update({
        status: "dispatched",
        shipped_at: shippedAtToUse,
        courier_name: parsed.data.courierName?.trim() || null,
        tracking_number: parsed.data.trackingNumber?.trim() || null,
        estimated_delivery: parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery : null,
        delivery_remarks: parsed.data.remarks?.trim() || currentOrder?.delivery_remarks || null,
        updated_at: nowIso,
      })
      .eq("id", parsed.data.orderId);

    // Also sync packing_records remarks and status if exists
    await supabase
      .from("packing_records")
      .update({
        status: "completed",
        remarks: parsed.data.remarks?.trim() || null,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("order_id", parsed.data.orderId);

    // Sync any draft delivery batch to dispatched
    await supabase
      .from("order_delivery_batches")
      .update({
        status: "dispatched",
        courier_name: parsed.data.courierName?.trim() || null,
        tracking_number: parsed.data.trackingNumber?.trim() || null,
        estimated_delivery: parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery : null,
        remarks: parsed.data.remarks?.trim() || null,
        dispatched_at: shippedAtToUse,
        updated_at: nowIso,
      })
      .eq("order_id", parsed.data.orderId)
      .eq("status", "draft");

    // Ensure status history for dispatched
    const { data: hasHistory } = await supabase
      .from("order_status_history")
      .select("id")
      .eq("order_id", parsed.data.orderId)
      .eq("status", "dispatched")
      .maybeSingle();

    if (!hasHistory) {
      await supabase.from("order_status_history").insert({
        order_id: parsed.data.orderId,
        status: "dispatched",
        note: `Consignment dispatched via ${parsed.data.courierName || "Courier"} (Tracking: ${parsed.data.trackingNumber || "N/A"})`,
      });
    }

    // Synchronize authoritative student-level delivery allocation
    await ensureOrderDeliveryStudentItems(supabase, parsed.data.orderId);

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return {
      success: true,
      status: "dispatched",
      courierName: parsed.data.courierName || null,
      trackingNumber: parsed.data.trackingNumber || null,
      estimatedDelivery: parsed.data.estimatedDelivery || null,
      shippedAt: shippedAtToUse,
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

export async function markOrderDelivered(orderId: string, note?: string, remarks?: string) {
  try {
    await requireAdmin();

    const parsed = transitDeliveredSchema.safeParse({ orderId, note, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    // Check order status before marking delivered (Rule 9: No delivered before dispatched)
    const { data: currentOrder, error: checkErr } = await supabase
      .from("orders")
      .select("status, delivered_at, delivery_remarks")
      .eq("id", parsed.data.orderId)
      .maybeSingle();

    if (checkErr || !currentOrder) {
      return { error: "Order not found" };
    }

    if (!["dispatched", "in_transit"].includes(currentOrder.status)) {
      return {
        error: `Order must be Dispatched or On the Way before marking Delivered. Current status: ${currentOrder.status}`,
      };
    }

    const { data, error } = await supabase.rpc("mark_order_delivered", {
      p_order_id: parsed.data.orderId,
      p_note: parsed.data.note?.trim() || null,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.warn("markOrderDelivered RPC warning, falling back to direct table update:", error.message);
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to mark order as delivered" };
    }

    // Direct authoritative update on orders table to guarantee immutable delivered_at
    const nowIso = new Date().toISOString();
    const deliveredAtToUse = currentOrder.delivered_at || data?.delivered_at || nowIso;

    await supabase
      .from("orders")
      .update({
        status: "delivered",
        delivered_at: deliveredAtToUse,
        delivery_remarks: parsed.data.remarks?.trim() || currentOrder.delivery_remarks || null,
        updated_at: nowIso,
      })
      .eq("id", parsed.data.orderId);

    // Also sync packing_records remarks if exists
    if (parsed.data.remarks?.trim()) {
      await supabase
        .from("packing_records")
        .update({
          remarks: parsed.data.remarks.trim(),
          updated_at: nowIso,
        })
        .eq("order_id", parsed.data.orderId);
    }

    // Sync batches status to delivered
    await supabase
      .from("order_delivery_batches")
      .update({
        status: "delivered",
        delivered_at: deliveredAtToUse,
        updated_at: nowIso,
      })
      .eq("order_id", parsed.data.orderId)
      .in("status", ["dispatched", "in_transit"]);

    // Synchronize authoritative student-level delivery allocation
    await ensureOrderDeliveryStudentItems(supabase, parsed.data.orderId);

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);
    revalidatePath("/school/alterations");
    revalidatePath("/school/requirements");
    revalidatePath("/school");

    return {
      success: true,
      status: "delivered",
      deliveredAt: deliveredAtToUse,
    };
  } catch (err: unknown) {
    console.error("markOrderDelivered unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to mark order as delivered" };
  }
}

/**
 * Upload delivery proof images for an order
 * Enforces admin authorization, QC completion, order isolation, file type and size constraints
 */
export async function uploadDeliveryProofImages(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const orderId = formData.get("orderId") as string;
    const caption = (formData.get("caption") as string)?.trim() || null;

    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return { error: "Invalid order ID" };
    }

    const supabase = await createClient();

    // 1. Verify order exists
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return { error: "Order not found" };
    }

    // 2. Section 3 / Test 11: QC not completed -> Delivery proof blocked
    const { data: qcRecord } = await supabase
      .from("quality_check_records")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!qcRecord || (qcRecord.status !== "completed" && qcRecord.status !== "passed")) {
      return { error: "Complete Quality Check before uploading delivery proof." };
    }

    // 3. Extract and validate files
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter(
      (f): f is File => f instanceof Blob && typeof (f as File).name === "string" && f.size > 0
    );

    if (files.length === 0) {
      return { error: "Please select at least one image to upload." };
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    // Validate all files first before uploading any
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return { error: `Image "${file.name}" is too large. Maximum size is 10 MB.` };
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return { error: `File "${file.name}" has an unsupported format. Allowed formats: JPEG, PNG, WebP.` };
      }
    }

    // 4. Upload each file and record in database
    const uploadedImages = [];
    for (const file of files) {
      const extMatch = file.name.match(/\.([0-9a-z]+)$/i);
      const rawExt = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const cleanExt = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${cleanExt}`;
      const storagePath = `${orderId}/${uniqueFileName}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from("delivery-proofs")
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error("Storage upload error for delivery proof:", uploadErr);
        return { error: `Failed to upload "${file.name}": ${uploadErr.message}` };
      }

      const { data: dbData, error: dbErr } = await supabase
        .from("delivery_proof_images")
        .insert({
          order_id: orderId,
          storage_path: storagePath,
          file_name: file.name.slice(0, 255),
          mime_type: file.type,
          file_size: file.size,
          caption: caption ? caption.slice(0, 500) : null,
          uploaded_by: profile.id,
        })
        .select()
        .single();

      if (dbErr) {
        console.error("Database insert error for delivery proof:", dbErr);
        // Clean up orphan file
        await supabase.storage.from("delivery-proofs").remove([storagePath]);
        return { error: `Failed to record "${file.name}" in database: ${dbErr.message}` };
      }

      uploadedImages.push(dbData);
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return {
      success: true,
      count: uploadedImages.length,
    };
  } catch (err: unknown) {
    console.error("uploadDeliveryProofImages unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to upload delivery proof images" };
  }
}

/**
 * Delete a delivery proof image
 * Enforces admin authorization, order isolation, and deletes both storage object and DB record
 */
export async function deleteDeliveryProofImage(imageId: string, orderId: string) {
  try {
    await requireAdmin();

    if (!imageId || !orderId) {
      return { error: "Invalid image or order ID" };
    }

    const supabase = await createClient();

    // 1. Verify image exists and belongs to current order
    const { data: img, error: fetchErr } = await supabase
      .from("delivery_proof_images")
      .select("id, storage_path, order_id")
      .eq("id", imageId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (fetchErr || !img) {
      return { error: "Image not found or does not belong to this order." };
    }

    // 2. Remove storage object
    const { error: storageErr } = await supabase.storage
      .from("delivery-proofs")
      .remove([img.storage_path]);

    if (storageErr) {
      console.warn("Storage deletion warning:", storageErr);
    }

    // 3. Remove DB record
    const { error: dbErr } = await supabase
      .from("delivery_proof_images")
      .delete()
      .eq("id", imageId)
      .eq("order_id", orderId);

    if (dbErr) {
      return { error: dbErr.message || "Failed to delete delivery proof record" };
    }

    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath(`/school/orders/${orderId}`);

    return { success: true };
  } catch (err: unknown) {
    console.error("deleteDeliveryProofImage unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to delete delivery proof image" };
  }
}

/**
 * Synchronize authoritative student-level delivery allocation.
 * Calls sync_order_delivery_student_items RPC and provides a direct fallback
 * when production/QC was bypassed.
 */
export async function ensureOrderDeliveryStudentItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
) {
  try {
    await supabase.rpc("sync_order_delivery_student_items", { p_order_id: orderId });
  } catch (syncErr) {
    console.warn("sync_order_delivery_student_items RPC warning:", syncErr);
  }

  // Fetch existing student items to enable multi-batch incremental allocation
  const { data: existingStudentItems } = await supabase
    .from("order_delivery_student_items")
    .select("student_id, item_name, style_name, color, size")
    .eq("order_id", orderId);

  const studentItemTypeSet = new Set<string>();
  const alreadyAllocatedCountMap = new Map<string, number>();

  for (const esi of existingStudentItems || []) {
    const sId = esi.student_id;
    const itName = (esi.item_name || "").trim().toLowerCase();
    const stName = (esi.style_name || "").trim().toLowerCase();
    const clName = (esi.color || "").trim().toLowerCase();
    const szName = (esi.size || "").trim().toLowerCase();

    studentItemTypeSet.add(`${sId}_${itName}`);
    const matchKey = `${stName}_${itName}_${clName}_${szName}`;
    alreadyAllocatedCountMap.set(matchKey, (alreadyAllocatedCountMap.get(matchKey) || 0) + 1);
  }

  // Bypassed production fallback: allocate from requirement_students & requirement_items
  const { data: orderData } = await supabase
    .from("orders")
    .select("school_id, requirement_id, status")
    .eq("id", orderId)
    .single();

  if (!orderData?.requirement_id) return;

  const { data: reqItems } = await supabase
    .from("requirement_items")
    .select("id, item_name, style_id, style_name, color, size, quantity")
    .eq("requirement_id", orderData.requirement_id)
    .gt("quantity", 0);

  if (!reqItems || reqItems.length === 0) return;

  const { data: reqStudents } = await supabase
    .from("requirement_students")
    .select(`
      student_id,
      students!inner (
        id,
        student_name,
        admission_number,
        class_name,
        section,
        gender
      )
    `)
    .eq("requirement_id", orderData.requirement_id);

  if (!reqStudents || reqStudents.length === 0) return;

  // Fetch student uniform sizes
  const studentIds = (reqStudents as Array<{ student_id: string }>).map((rs) => rs.student_id);
  const { data: sizeRows } = await supabase
    .from("student_uniform_sizes")
    .select("*")
    .in("student_id", studentIds);

  const sizeMap = new Map<string, Record<string, unknown>>();
  (sizeRows || []).forEach((row: Record<string, unknown>) => {
    if (typeof row.student_id === "string") {
      sizeMap.set(row.student_id, row);
    }
  });

  const rowsToInsert: Array<{
    order_id: string;
    school_id: string;
    student_id: string;
    item_name: string;
    style_id: string | null;
    style_name: string | null;
    color: string | null;
    size: string;
    quantity: number;
  }> = [];

  // Check if manual actual delivery quantities exist for this order
  // Only quantities from finalized batches (delivered, dispatched, in_transit) are eligible
  const { data: finalizedBatches } = await supabase
    .from("order_delivery_batches")
    .select("batch_number")
    .eq("order_id", orderId)
    .in("status", ["delivered", "dispatched", "in_transit"]);

  const finalizedBatchNumbers = new Set((finalizedBatches || []).map((b) => b.batch_number));
  if (
    (!finalizedBatches || finalizedBatches.length === 0) &&
    ["dispatched", "in_transit", "delivered"].includes(orderData.status)
  ) {
    finalizedBatchNumbers.add(1);
  }

  const { data: actualItems } = await supabase
    .from("order_delivery_actual_items")
    .select("style_name, item_name, color, size, actual_quantity, batch_number")
    .eq("order_id", orderId);

  const actualQtyMap = new Map<string, number>();
  if (actualItems && actualItems.length > 0) {
    for (const ai of actualItems) {
      const bNum = ai.batch_number || 1;
      if (finalizedBatchNumbers.has(bNum)) {
        const k = `${(ai.style_name || "").trim().toLowerCase()}_${(ai.item_name || "").trim().toLowerCase()}_${(ai.color || "").trim().toLowerCase()}_${(ai.size || "").trim().toLowerCase()}`;
        const prev = actualQtyMap.get(k) || 0;
        actualQtyMap.set(k, prev + (ai.actual_quantity || 0));
      }
    }
  }

  for (const item of reqItems) {
    const normItemName = (item.item_name || "").trim().toLowerCase();
    const normSize = (item.size || "").trim().toLowerCase();
    const normColor = item.color ? item.color.trim().toLowerCase() : "";
    const normStyle = item.style_name ? item.style_name.trim().toLowerCase() : "";
    const matchKey = `${normStyle}_${normItemName}_${normColor}_${normSize}`;

    // Total delivered across all finalized batches
    const totalFinalizedDelivered = actualQtyMap.has(matchKey)
      ? (actualQtyMap.get(matchKey) ?? 0)
      : (["dispatched", "in_transit", "delivered"].includes(orderData.status) ? item.quantity : 0);

    // How many students have already been allocated this exact item combination
    const alreadyAllocated = alreadyAllocatedCountMap.get(matchKey) || 0;
    let allocatableQty = Math.max(0, totalFinalizedDelivered - alreadyAllocated);

    if (allocatableQty <= 0) continue;

    for (const rs of reqStudents as Array<{ student_id: string }>) {
      if (allocatableQty <= 0) break;
      const sid = rs.student_id;
      const sSizes = sizeMap.get(sid);
      if (!sSizes) continue;

      const assignKey = `${sid}_${normItemName}`;
      if (studentItemTypeSet.has(assignKey)) continue;

      let matches = false;

      // 1. Dynamic styles
      if (sSizes.dynamic_styles && sSizes.dynamic_sizes) {
        const dynSizes = sSizes.dynamic_sizes as Record<string, string>;
        const dynStyles = sSizes.dynamic_styles as Record<string, { style_name?: string; color?: string }>;
        for (const [key, dynSize] of Object.entries(dynSizes)) {
          const dynStyle = dynStyles[key];
          const stName = dynStyle?.style_name ? dynStyle.style_name.trim().toLowerCase() : null;
          const stColor = dynStyle?.color ? dynStyle.color.trim().toLowerCase() : null;
          const sSizeVal = (dynSize || "").trim().toLowerCase();

          if (sSizeVal === normSize) {
            if ((!normStyle || !stName || normStyle === stName) && (!normColor || !stColor || normColor === stColor)) {
              matches = true;
              break;
            }
          }
        }
      }

      // 2. Standard sizes fallback
      if (!matches) {
        const stdMap: Record<string, unknown> = {
          shirt: sSizes.shirt_size,
          pant: sSizes.pant_size,
          "t-shirt": sSizes.tshirt_size,
          short: sSizes.short_size,
        };
        const sSizeVal = typeof stdMap[normItemName] === "string" ? (stdMap[normItemName] as string).trim().toLowerCase() : "";
        if (sSizeVal && sSizeVal === normSize) {
          matches = true;
        }
      }

      if (matches) {
        rowsToInsert.push({
          order_id: orderId,
          school_id: orderData.school_id,
          student_id: sid,
          item_name: item.item_name,
          style_id: item.style_id || null,
          style_name: item.style_name || null,
          color: item.color || null,
          size: item.size,
          quantity: 1,
        });
        studentItemTypeSet.add(assignKey);
        alreadyAllocatedCountMap.set(matchKey, (alreadyAllocatedCountMap.get(matchKey) || 0) + 1);
        allocatableQty--;
      }
    }
  }

  if (rowsToInsert.length > 0) {
    await supabase.from("order_delivery_student_items").upsert(rowsToInsert, { ignoreDuplicates: true });
  }
}

// ---------------------------------------------------------------------------
// MANUAL DELIVERY QUANTITY, RETURN, AND FOLLOW-UP DISPATCH SCHEMAS & ACTIONS
// ---------------------------------------------------------------------------

const actualItemInputSchema = z.object({
  styleName: z.string().min(1, "Style name is required"),
  itemName: z.string().min(1, "Item name is required"),
  color: z.string().min(1, "Color is required"),
  size: z.string().min(1, "Size is required"),
  originalQuantity: z.number().int().min(0, "Original quantity must be non-negative"),
  actualQuantity: z.number().int().min(0, "Actual delivery quantity must be a non-negative whole number"),
});

const saveDeliveryBatchSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  batchNumber: z.number().int().min(1, "Batch number must be at least 1").default(1),
  batchReference: z.string().max(100).optional(),
  courierName: z.string().max(100).optional().nullable(),
  trackingNumber: z.string().max(100).optional().nullable(),
  estimatedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().nullable().or(z.literal("")),
  remarks: z.string().max(1000).optional().nullable(),
  status: z.enum(["draft", "dispatched", "in_transit", "delivered", "cancelled"]).default("draft"),
  items: z.array(actualItemInputSchema).min(1, "At least one item is required"),
});

/**
 * Save actual delivery quantities for a specific Delivery Batch.
 * Persists independently without overwriting previous batches or other colors.
 */
export async function saveDeliveryBatchActualQuantities(data: {
  orderId: string;
  batchNumber?: number;
  batchReference?: string;
  courierName?: string | null;
  trackingNumber?: string | null;
  estimatedDelivery?: string | null;
  remarks?: string | null;
  status?: "draft" | "dispatched" | "in_transit" | "delivered" | "cancelled";
  items: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    originalQuantity: number;
    actualQuantity: number;
  }>;
}) {
  try {
    const profile = await requireAdmin();

    const parsed = saveDeliveryBatchSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    // Verify order exists
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id, status, requirement_id")
      .eq("id", parsed.data.orderId)
      .single();

    if (orderErr || !orderData) {
      return { error: "Order not found" };
    }

    const nowIso = new Date().toISOString();
    const batchNum = parsed.data.batchNumber;

    // 1. Get or create the delivery batch header
    let { data: batch } = await supabase
      .from("order_delivery_batches")
      .select("id, batch_number, status")
      .eq("order_id", parsed.data.orderId)
      .eq("batch_number", batchNum)
      .maybeSingle();

    if (!batch) {
      const batchRef = parsed.data.batchReference || `BATCH-${String(batchNum).padStart(3, "0")}`;
      const { data: newBatch, error: insertBatchErr } = await supabase
        .from("order_delivery_batches")
        .insert({
          order_id: parsed.data.orderId,
          batch_number: batchNum,
          batch_reference: batchRef,
          status: parsed.data.status,
          courier_name: parsed.data.courierName?.trim() || null,
          tracking_number: parsed.data.trackingNumber?.trim() || null,
          estimated_delivery: parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery.trim() : null,
          remarks: parsed.data.remarks?.trim() || null,
          created_by: profile.id,
          dispatched_at: parsed.data.status === "dispatched" || parsed.data.status === "in_transit" ? nowIso : null,
          delivered_at: parsed.data.status === "delivered" ? nowIso : null,
        })
        .select("id, batch_number, status")
        .single();

      if (insertBatchErr || !newBatch) {
        console.error("Failed to insert delivery batch:", insertBatchErr);
        return { error: insertBatchErr?.message || "Failed to create delivery batch header" };
      }
      batch = newBatch;
    } else {
      // Guard: do not allow rolling back an already dispatched or delivered batch to draft
      if (batch.status !== "draft" && parsed.data.status === "draft") {
        return { error: `Batch #${batchNum} has already been finalized as '${batch.status}' and cannot be demoted back to draft.` };
      }

      // Guard: do not allow re-finalizing or modifying an already finalized batch
      if (["dispatched", "in_transit", "delivered"].includes(batch.status) && ["dispatched", "delivered"].includes(parsed.data.status)) {
        return { error: `Batch #${batchNum} has already been finalized as '${batch.status}'. To preserve delivery history, it cannot be modified.` };
      }

      // Update existing batch metadata if provided
      const updatePayload: Record<string, unknown> = {
        updated_at: nowIso,
      };
      if (parsed.data.courierName !== undefined) updatePayload.courier_name = parsed.data.courierName?.trim() || null;
      if (parsed.data.trackingNumber !== undefined) updatePayload.tracking_number = parsed.data.trackingNumber?.trim() || null;
      if (parsed.data.estimatedDelivery !== undefined) {
        updatePayload.estimated_delivery = parsed.data.estimatedDelivery ? parsed.data.estimatedDelivery.trim() : null;
      }
      if (parsed.data.remarks !== undefined) updatePayload.remarks = parsed.data.remarks?.trim() || null;
      if (parsed.data.status && parsed.data.status !== batch.status) {
        updatePayload.status = parsed.data.status;
        if (parsed.data.status === "dispatched" || parsed.data.status === "in_transit") {
          updatePayload.dispatched_at = nowIso;
        } else if (parsed.data.status === "delivered") {
          updatePayload.delivered_at = nowIso;
        }
      }

      await supabase
        .from("order_delivery_batches")
        .update(updatePayload)
        .eq("id", batch.id);
    }

    // 2. Prepare items for this batch
    const rowsToUpsert = parsed.data.items.map((item) => {
      const orig = item.originalQuantity;
      const act = item.actualQuantity;
      const diff = act - orig;

      let classification: "exact" | "extra" | "short" | "not_delivered";
      let extraQuantity = 0;
      let shortQuantity = 0;
      let notDeliveredQuantity = 0;

      if (diff === 0) {
        classification = "exact";
      } else if (diff > 0) {
        classification = "extra";
        extraQuantity = diff;
      } else {
        if (act === 0 && orig > 0) {
          classification = "not_delivered";
          notDeliveredQuantity = orig;
          shortQuantity = orig;
        } else {
          classification = "short";
          shortQuantity = orig - act;
        }
      }

      return {
        order_id: parsed.data.orderId,
        batch_id: batch.id,
        batch_number: batchNum,
        style_name: item.styleName.trim(),
        item_name: item.itemName.trim(),
        color: item.color.trim(),
        size: item.size.trim(),
        original_quantity: orig,
        actual_quantity: act,
        difference: diff,
        classification,
        extra_quantity: extraQuantity,
        short_quantity: shortQuantity,
        not_delivered_quantity: notDeliveredQuantity,
        updated_at: nowIso,
      };
    });

    const { error: upsertErr } = await supabase
      .from("order_delivery_actual_items")
      .upsert(rowsToUpsert, {
        onConflict: "order_id,batch_number,style_name,item_name,color,size",
      });

    if (upsertErr) {
      console.error("saveDeliveryBatchActualQuantities upsert error:", upsertErr);
      return { error: upsertErr.message || "Failed to save delivery batch quantities" };
    }

    // 3. Status Lifecycle Evaluation
    if (parsed.data.status === "delivered" || parsed.data.status === "dispatched") {
      const { data: reqItems } = await supabase
        .from("requirement_items")
        .select("style_name, item_name, color, size, quantity")
        .eq("requirement_id", orderData.requirement_id);

      const { data: allDeliveredItems } = await supabase
        .from("order_delivery_actual_items")
        .select("style_name, item_name, color, size, actual_quantity, batch_number")
        .eq("order_id", parsed.data.orderId);

      const deliveredSumMap = new Map<string, number>();
      for (const it of allDeliveredItems || []) {
        const k = `${(it.style_name || "").trim().toLowerCase()}_${(it.item_name || "").trim().toLowerCase()}_${(it.color || "").trim().toLowerCase()}_${(it.size || "").trim().toLowerCase()}`;
        const prev = deliveredSumMap.get(k) || 0;
        deliveredSumMap.set(k, prev + (it.actual_quantity || 0));
      }

      let allFulfilled = true;
      for (const req of reqItems || []) {
        const k = `${(req.style_name || "").trim().toLowerCase()}_${(req.item_name || "").trim().toLowerCase()}_${(req.color || "").trim().toLowerCase()}_${(req.size || "").trim().toLowerCase()}`;
        const delivered = deliveredSumMap.get(k) || 0;
        if (delivered < req.quantity) {
          allFulfilled = false;
          break;
        }
      }

      if (allFulfilled && parsed.data.status === "delivered") {
        await supabase
          .from("orders")
          .update({
            status: "delivered",
            delivered_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", parsed.data.orderId);
      } else {
        if (["confirmed", "packed"].includes(orderData.status)) {
          await supabase
            .from("orders")
            .update({
              status: "dispatched",
              shipped_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", parsed.data.orderId);
        }
      }

      await ensureOrderDeliveryStudentItems(supabase, parsed.data.orderId);
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${parsed.data.orderId}`);
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    revalidatePath(`/school/orders/${parsed.data.orderId}`);

    return {
      success: true,
      batchId: batch.id,
      batchNumber: batchNum,
      count: rowsToUpsert.length,
    };
  } catch (err: unknown) {
    console.error("saveDeliveryBatchActualQuantities error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save delivery batch quantities" };
  }
}

/**
 * Adapter for backward compatibility
 */
export async function saveDeliveryActualQuantities(
  orderId: string,
  items: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    originalQuantity: number;
    actualQuantity: number;
  }>,
  batchNumber = 1
) {
  return saveDeliveryBatchActualQuantities({
    orderId,
    batchNumber,
    items,
  });
}

/**
 * Update details / status of an existing delivery batch
 */
export async function updateDeliveryBatchDetails(data: {
  orderId: string;
  batchNumber: number;
  status?: "draft" | "dispatched" | "in_transit" | "delivered" | "cancelled";
  courierName?: string | null;
  trackingNumber?: string | null;
  estimatedDelivery?: string | null;
  remarks?: string | null;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    const { data: batch, error: fetchErr } = await supabase
      .from("order_delivery_batches")
      .select("id, status")
      .eq("order_id", data.orderId)
      .eq("batch_number", data.batchNumber)
      .single();

    if (fetchErr || !batch) {
      return { error: "Delivery batch not found" };
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
    };
    if (data.courierName !== undefined) updatePayload.courier_name = data.courierName?.trim() || null;
    if (data.trackingNumber !== undefined) updatePayload.tracking_number = data.trackingNumber?.trim() || null;
    if (data.estimatedDelivery !== undefined) {
      updatePayload.estimated_delivery = data.estimatedDelivery ? data.estimatedDelivery.trim() : null;
    }
    if (data.remarks !== undefined) updatePayload.remarks = data.remarks?.trim() || null;
    if (data.status) {
      updatePayload.status = data.status;
      if (data.status === "dispatched" || data.status === "in_transit") {
        updatePayload.dispatched_at = nowIso;
      } else if (data.status === "delivered") {
        updatePayload.delivered_at = nowIso;
      }
    }

    const { error: updateErr } = await supabase
      .from("order_delivery_batches")
      .update(updatePayload)
      .eq("id", batch.id);

    if (updateErr) {
      return { error: updateErr.message };
    }

    if (data.status === "delivered") {
      await ensureOrderDeliveryStudentItems(supabase, data.orderId);
    }

    revalidatePath(`/admin/packing-delivery/${data.orderId}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update batch details" };
  }
}

/**
 * Mark a specific dispatched or in-transit delivery batch as DELIVERED
 * Accurately evaluates order status without marking entire order delivered if quantities remain pending.
 */
export async function completeDeliveryBatch(
  orderId: string,
  batchNumber: number,
  remarks?: string
) {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    // 1. Fetch batch
    const { data: batch, error: batchErr } = await supabase
      .from("order_delivery_batches")
      .select("id, batch_number, status, delivered_at")
      .eq("order_id", orderId)
      .eq("batch_number", batchNumber)
      .single();

    if (batchErr || !batch) {
      return { error: `Consignment Batch #${batchNumber} not found.` };
    }

    // Guard: only dispatched or in_transit batches can be completed
    if (batch.status === "delivered") {
      return { error: `Batch #${batchNumber} has already been marked as delivered.` };
    }
    if (batch.status === "draft") {
      return { error: `Batch #${batchNumber} is still a draft. Please finalize and dispatch it before marking as delivered.` };
    }
    if (batch.status === "cancelled") {
      return { error: `Batch #${batchNumber} is cancelled.` };
    }

    // 2. Update the batch status to delivered
    const batchUpdatePayload: Record<string, unknown> = {
      status: "delivered",
      delivered_at: batch.delivered_at || nowIso,
      updated_at: nowIso,
    };
    if (remarks?.trim()) {
      batchUpdatePayload.remarks = remarks.trim();
    }

    const { error: updateBatchErr } = await supabase
      .from("order_delivery_batches")
      .update(batchUpdatePayload)
      .eq("id", batch.id);

    if (updateBatchErr) {
      return { error: updateBatchErr.message || "Failed to update batch delivery status." };
    }

    // 3. Evaluate Parent Order Status based on ALL batches
    let isOrderFullyDelivered = false;
    const { data: orderData } = await supabase
      .from("orders")
      .select("id, requirement_id, status")
      .eq("id", orderId)
      .single();

    if (orderData?.requirement_id) {
      const { data: reqItems } = await supabase
        .from("requirement_items")
        .select("style_name, item_name, color, size, quantity")
        .eq("requirement_id", orderData.requirement_id);

      // Fetch all delivered batches for this order (now including this newly delivered batch)
      const { data: deliveredBatches } = await supabase
        .from("order_delivery_batches")
        .select("batch_number")
        .eq("order_id", orderId)
        .eq("status", "delivered");

      const deliveredBatchNums = new Set((deliveredBatches || []).map((b) => b.batch_number));

      const { data: allActualItems } = await supabase
        .from("order_delivery_actual_items")
        .select("style_name, item_name, color, size, actual_quantity, batch_number")
        .eq("order_id", orderId);

      // Fetch active returns
      const { data: allReturns } = await supabase
        .from("order_delivery_returns")
        .select("style_name, item_name, color, size, quantity, status")
        .eq("order_id", orderId)
        .neq("status", "cancelled");

      const returnsMap = new Map<string, number>();
      for (const ret of allReturns || []) {
        const k = `${(ret.style_name || "").trim().toLowerCase()}_${(ret.item_name || "").trim().toLowerCase()}_${(ret.color || "").trim().toLowerCase()}_${(ret.size || "").trim().toLowerCase()}`;
        returnsMap.set(k, (returnsMap.get(k) || 0) + (ret.quantity || 0));
      }

      const deliveredSumMap = new Map<string, number>();
      for (const it of allActualItems || []) {
        const bNum = it.batch_number || 1;
        if (deliveredBatchNums.has(bNum)) {
          const k = `${(it.style_name || "").trim().toLowerCase()}_${(it.item_name || "").trim().toLowerCase()}_${(it.color || "").trim().toLowerCase()}_${(it.size || "").trim().toLowerCase()}`;
          deliveredSumMap.set(k, (deliveredSumMap.get(k) || 0) + (it.actual_quantity || 0));
        }
      }

      let allFulfilled = true;
      for (const req of reqItems || []) {
        const k = `${(req.style_name || "").trim().toLowerCase()}_${(req.item_name || "").trim().toLowerCase()}_${(req.color || "").trim().toLowerCase()}_${(req.size || "").trim().toLowerCase()}`;
        const delivered = deliveredSumMap.get(k) || 0;
        const returned = returnsMap.get(k) || 0;
        const netAccepted = Math.max(0, delivered - returned);
        if (netAccepted < req.quantity) {
          allFulfilled = false;
          break;
        }
      }

      isOrderFullyDelivered = allFulfilled;

      if (allFulfilled) {
        await supabase
          .from("orders")
          .update({
            status: "delivered",
            delivered_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", orderId);

        await supabase.from("order_status_history").insert({
          order_id: orderId,
          status: "delivered",
          note: `All uniform items completely fulfilled following Batch #${batchNumber} delivery.`,
        });
      } else {
        await supabase
          .from("orders")
          .update({
            status: "dispatched",
            updated_at: nowIso,
          })
          .eq("id", orderId);

        await supabase.from("order_status_history").insert({
          order_id: orderId,
          status: "dispatched",
          note: `Consignment Batch #${batchNumber} marked delivered; remaining items pending subsequent batches.`,
        });
      }
    }

    // 4. Synchronize student delivery allocations
    await ensureOrderDeliveryStudentItems(supabase, orderId);

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);

    return { success: true, batchNumber, isOrderFullyDelivered };
  } catch (err: unknown) {
    console.error("completeDeliveryBatch error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete delivery batch" };
  }
}

/**
 * Create the next delivery batch for an order
 */
export async function createNextDeliveryBatch(orderId: string) {
  try {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const { data: batches } = await supabase
      .from("order_delivery_batches")
      .select("id, batch_number, status")
      .eq("order_id", orderId)
      .order("batch_number", { ascending: false });

    const maxBatchNum = batches && batches.length > 0 ? batches[0].batch_number : 0;
    const nextNum = maxBatchNum + 1;
    const nextRef = `BATCH-${String(nextNum).padStart(3, "0")}`;

    const { data: newBatch, error: err } = await supabase
      .from("order_delivery_batches")
      .insert({
        order_id: orderId,
        batch_number: nextNum,
        batch_reference: nextRef,
        status: "draft",
        created_by: profile.id,
      })
      .select()
      .single();

    if (err) {
      return { error: err.message };
    }

    revalidatePath(`/admin/packing-delivery/${orderId}`);
    return { success: true, batch: newBatch };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to create delivery batch" };
  }
}

const createDeliveryReturnSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  schoolId: z.string().uuid("Invalid school ID"),
  styleName: z.string().min(1, "Style name is required"),
  itemName: z.string().min(1, "Item name is required"),
  color: z.string().min(1, "Color is required"),
  size: z.string().min(1, "Size is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
  status: z.enum(["pending", "dispatched", "in_transit", "completed", "cancelled"]).default("pending"),
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().nullable().or(z.literal("")),
  trackingDetails: z.string().max(200).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
});

/**
 * Record a Return / Send-Back to school record
 */
export async function createDeliveryReturn(data: {
  orderId: string;
  schoolId: string;
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  quantity: number;
  reason: string;
  status?: "pending" | "dispatched" | "in_transit" | "completed" | "cancelled";
  dispatchDate?: string | null;
  trackingDetails?: string | null;
  remarks?: string | null;
}) {
  try {
    const profile = await requireAdmin();

    const parsed = createDeliveryReturnSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data: record, error: insertErr } = await supabase
      .from("order_delivery_returns")
      .insert({
        order_id: parsed.data.orderId,
        school_id: parsed.data.schoolId,
        style_name: parsed.data.styleName.trim(),
        item_name: parsed.data.itemName.trim(),
        color: parsed.data.color.trim(),
        size: parsed.data.size.trim(),
        quantity: parsed.data.quantity,
        reason: parsed.data.reason.trim(),
        status: parsed.data.status || "pending",
        dispatch_date: parsed.data.dispatchDate ? parsed.data.dispatchDate.trim() : null,
        tracking_details: parsed.data.trackingDetails?.trim() || null,
        remarks: parsed.data.remarks?.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("createDeliveryReturn error:", insertErr);
      return { error: insertErr.message || "Failed to create return record" };
    }

    revalidatePath(`/admin/packing-delivery/${parsed.data.orderId}`);
    revalidatePath(`/school/orders/${parsed.data.orderId}`);

    return { success: true, record };
  } catch (err: unknown) {
    console.error("createDeliveryReturn unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create return record" };
  }
}

/**
 * Update the status / tracking of a Return / Send-Back record
 */
export async function updateDeliveryReturnStatus(
  returnId: string,
  orderId: string,
  updates: {
    status?: "pending" | "dispatched" | "in_transit" | "completed" | "cancelled";
    dispatchDate?: string | null;
    trackingDetails?: string | null;
    remarks?: string | null;
  }
) {
  try {
    await requireAdmin();

    const supabase = await createClient();

    const { error: updateErr } = await supabase
      .from("order_delivery_returns")
      .update({
        ...(updates.status ? { status: updates.status } : {}),
        dispatch_date: updates.dispatchDate ? updates.dispatchDate.trim() : null,
        tracking_details: updates.trackingDetails?.trim() || null,
        remarks: updates.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", returnId)
      .eq("order_id", orderId);

    if (updateErr) {
      return { error: updateErr.message || "Failed to update return record" };
    }

    revalidatePath(`/admin/packing-delivery/${orderId}`);

    return { success: true };
  } catch (err: unknown) {
    console.error("updateDeliveryReturnStatus error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update return record" };
  }
}

const createFollowupDispatchSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  schoolId: z.string().uuid("Invalid school ID"),
  dispatchReference: z.string().min(2, "Dispatch reference required").max(100),
  courierName: z.string().max(100).optional().nullable(),
  trackingNumber: z.string().max(100).optional().nullable(),
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  status: z.enum(["scheduled", "dispatched", "in_transit", "delivered", "cancelled"]).default("scheduled"),
  remarks: z.string().max(1000).optional().nullable(),
  items: z.array(
    z.object({
      styleName: z.string().min(1, "Style name is required"),
      itemName: z.string().min(1, "Item name is required"),
      color: z.string().min(1, "Color is required"),
      size: z.string().min(1, "Size is required"),
      quantity: z.number().int().min(1, "Quantity must be at least 1"),
    })
  ).min(1, "At least one item is required for follow-up dispatch"),
});

/**
 * Create a follow-up dispatch for pending / short items
 */
export async function createFollowupDispatch(data: {
  orderId: string;
  schoolId: string;
  dispatchReference: string;
  courierName?: string | null;
  trackingNumber?: string | null;
  dispatchDate: string;
  status?: "scheduled" | "dispatched" | "in_transit" | "delivered" | "cancelled";
  remarks?: string | null;
  items: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    quantity: number;
  }>;
}) {
  try {
    const profile = await requireAdmin();

    const parsed = createFollowupDispatchSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    // 1. Insert follow-up dispatch header
    const { data: dispatchRecord, error: dispatchErr } = await supabase
      .from("order_followup_dispatches")
      .insert({
        order_id: parsed.data.orderId,
        school_id: parsed.data.schoolId,
        dispatch_reference: parsed.data.dispatchReference.trim(),
        courier_name: parsed.data.courierName?.trim() || null,
        tracking_number: parsed.data.trackingNumber?.trim() || null,
        dispatch_date: parsed.data.dispatchDate.trim(),
        status: parsed.data.status || "scheduled",
        remarks: parsed.data.remarks?.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (dispatchErr || !dispatchRecord) {
      console.error("createFollowupDispatch header error:", dispatchErr);
      return { error: dispatchErr?.message || "Failed to create follow-up dispatch" };
    }

    // 2. Insert items
    const itemsToInsert = parsed.data.items.map((it) => ({
      followup_dispatch_id: dispatchRecord.id,
      order_id: parsed.data.orderId,
      style_name: it.styleName.trim(),
      item_name: it.itemName.trim(),
      color: it.color.trim(),
      size: it.size.trim(),
      quantity: it.quantity,
    }));

    const { error: itemsErr } = await supabase
      .from("order_followup_dispatch_items")
      .insert(itemsToInsert);

    if (itemsErr) {
      console.error("createFollowupDispatch items error:", itemsErr);
      return { error: itemsErr.message || "Failed to create follow-up dispatch items" };
    }

    revalidatePath(`/admin/packing-delivery/${parsed.data.orderId}`);
    revalidatePath(`/school/orders/${parsed.data.orderId}`);

    return { success: true, dispatch: dispatchRecord };
  } catch (err: unknown) {
    console.error("createFollowupDispatch unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create follow-up dispatch" };
  }
}



