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
    await requireAdmin();

    const parsed = startPackingSchema.safeParse({ orderId, remarks });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("start_delivery", {
      p_order_id: parsed.data.orderId,
      p_remarks: parsed.data.remarks?.trim() || null,
    });

    if (error) {
      console.error("startDelivery RPC error:", error);
      return { error: error.message || "Failed to start delivery" };
    }

    if (data && !data.success) {
      return { error: data.error || "Failed to start delivery" };
    }

    revalidatePath("/admin/packing-delivery");
    revalidatePath(`/admin/packing-delivery/${orderId}`);
    revalidatePath("/admin/quality-check");
    revalidatePath(`/admin/quality-check/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      deliveryId: data.delivery_id,
      totalQuantity: data.total_quantity,
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
      return { error: data.error || "Failed to dispatch order" };
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

    // Synchronize authoritative student-level delivery allocation
    try {
      await supabase.rpc("sync_order_delivery_student_items", { p_order_id: parsed.data.orderId });
    } catch (syncErr) {
      console.warn("sync_order_delivery_student_items warning during dispatch:", syncErr);
    }

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

    // Synchronize authoritative student-level delivery allocation
    try {
      await supabase.rpc("sync_order_delivery_student_items", { p_order_id: parsed.data.orderId });
    } catch (syncErr) {
      console.warn("sync_order_delivery_student_items warning during mark delivered:", syncErr);
    }

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

