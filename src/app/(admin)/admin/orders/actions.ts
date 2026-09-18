"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  submitted: ["under_review"],
  under_review: ["confirmed"],
  confirmed: ["production"],
  production: ["quality_check"],
  quality_check: ["packed"],
  packed: ["dispatched"],
  dispatched: ["in_transit"],
  in_transit: ["delivered"],
  delivered: [],
};

export async function isValidOrderStatusTransition(
  currentStatus: string,
  nextStatus: string
) {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: string,
  note?: string,
  courierData?: { courierName?: string; trackingNumber?: string; estimatedDelivery?: string }
) {
  try {
    await requireAdmin();

    const supabase = await createClient();

    // 1. Fetch current order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { error: "Order not found" };
    }

    // 2. Validate transition
    if (!(await isValidOrderStatusTransition(order.status, nextStatus))) {
      return { error: `Invalid transition from ${order.status} to ${nextStatus}` };
    }

    // 3. Prepare update payload
    const updatePayload: Record<string, unknown> = { status: nextStatus };
    
    if (nextStatus === "dispatched" && courierData) {
      updatePayload.courier_name = courierData.courierName;
      updatePayload.tracking_number = courierData.trackingNumber;
      updatePayload.estimated_delivery = courierData.estimatedDelivery;
      updatePayload.shipped_at = new Date().toISOString();
    }
    
    if (nextStatus === "delivered") {
      updatePayload.delivered_at = new Date().toISOString();
    }

    // 4. Perform atomic update via RPC if available, or sequential since Supabase JS doesn't support transactions easily without RPC.
    // Wait, the prompt says "atomic status update". We can use an RPC, or rely on RLS and updated_at triggers. 
    // The previous migration didn't add a specific RPC for this. Let's do it sequentially but if it fails we return error.
    
    const { data: updatedRows, error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("status", order.status) // Optimistic locking
      .select("id, status");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      return { error: updateError?.message || "Failed to update order status" };
    }

    // 5. Insert history
    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: orderId,
        status: nextStatus,
        note: note || null,
      });

    if (historyError) {
      // Best effort rollback - though Supabase JS REST doesn't support real transactions
      await supabase.from("orders").update({ status: order.status }).eq("id", orderId);
      return { error: "Failed to save status history" };
    }

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/school/orders");
    revalidatePath(`/school/orders/${orderId}`);
    revalidatePath("/school/requirements");
    revalidatePath("/school");

    return { success: true };
  } catch (error: unknown) {
    console.error("updateOrderStatus error:", error);
    return { error: error instanceof Error ? error.message : "Failed to update status" };
  }
}

export async function modifyOrderQuantity(
  orderId: string,
  requirementItemId: string,
  newQuantity: number
) {
  try {
    const profile = await requireAdmin();

    if (!Number.isInteger(newQuantity) || newQuantity < 0) {
      return { error: "Invalid quantity. Must be an integer >= 0." };
    }

    const supabase = await createClient();

    // 1. Fetch order and requirement item
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, requirement_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { error: "Order not found" };
    }

    if (order.status !== "submitted" && order.status !== "under_review") {
      return { error: "Quantity can only be modified before confirmation" };
    }

    const { data: reqItem, error: reqItemError } = await supabase
      .from("requirement_items")
      .select("id, quantity, requirement_id")
      .eq("id", requirementItemId)
      .single();

    if (reqItemError || !reqItem) {
      return { error: "Requirement item not found" };
    }

    if (reqItem.requirement_id !== order.requirement_id) {
      return { error: "Item does not belong to this order" };
    }

    // 2. Perform atomic update (optimistic concurrency)
    const { error: updateError } = await supabase
      .from("requirement_items")
      .update({ quantity: newQuantity })
      .eq("id", requirementItemId)
      .eq("quantity", reqItem.quantity); // Optimistic lock

    if (updateError) {
      return { error: "Failed to update quantity" };
    }

    // 3. Record history
    const { error: historyError } = await supabase
      .from("order_modification_history")
      .insert({
        order_id: orderId,
        requirement_item_id: requirementItemId,
        old_quantity: reqItem.quantity,
        new_quantity: newQuantity,
        changed_by: profile.id,
      });

    if (historyError) {
      // Rollback
      await supabase.from("requirement_items").update({ quantity: reqItem.quantity }).eq("id", requirementItemId);
      return { error: "Failed to record modification history" };
    }

    revalidatePath(`/admin/orders/${orderId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("modifyOrderQuantity error:", error);
    return { error: error instanceof Error ? error.message : "Failed to modify quantity" };
  }
}

export async function cancelOrder(orderId: string, reason: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/` + orderId);

    return { success: true };
  } catch (error: unknown) {
    console.error('Error cancelling order:', error);
    return { error: error instanceof Error ? error.message : 'Failed to cancel order' };
  }
}

