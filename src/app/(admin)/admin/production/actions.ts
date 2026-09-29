"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_PRODUCTION_SEQUENCE,
  OrderWorkflowStage,
  validateWorkflowSequence,
} from "@/lib/productionWorkflow";

export async function saveOrderWorkflow(orderId: string, stageKeys: string[]) {
  try {
    await requireAdmin();

    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const validation = validateWorkflowSequence(stageKeys);
    if (!validation.valid) {
      return { error: validation.error || "Invalid workflow stage sequence." };
    }

    const supabase = await createClient();

    // Check if order exists and if production has started
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return { error: "Order not found" };
    }

    // Server-side stage gate: Stock Sizes, Inventory, and Cutting must all be completed
    const { data: initialStages } = await supabase
      .from("order_production_workflows")
      .select("stage_key, status")
      .eq("order_id", orderId)
      .in("stage_key", ["stock_sizes", "inventory", "cutting"]);

    const allInitialCompleted =
      initialStages?.filter((s) => s.status === "completed").length === 3;

    if (!allInitialCompleted) {
      return {
        error:
          "Cannot arrange middle sequence. Stock Sizes, Inventory, and Cutting must all be completed first.",
      };
    }

    // Locking check
    const lockedStatuses = [
      "quality_check",
      "packed",
      "dispatched",
      "in_transit",
      "delivered",
      "cancelled",
    ];
    if (lockedStatuses.includes(order.status)) {
      return {
        error: "Production workflow is locked because production has already started.",
      };
    }

    // Check if any stage in positions 4..8 has already started or completed
    const { data: activeMiddleOrFinal } = await supabase
      .from("order_production_workflows")
      .select("id")
      .eq("order_id", orderId)
      .gte("sequence_order", 4)
      .in("status", ["in_progress", "completed"]);

    if (activeMiddleOrFinal && activeMiddleOrFinal.length > 0) {
      return {
        error: "Production sequence is locked because production has started.",
      };
    }

    // Check if production has already recorded completed quantity in middle or final stages
    const { data: existingProd } = await supabase
      .from("production_records")
      .select("id, stage, completed_quantity")
      .eq("order_id", orderId)
      .maybeSingle();

    if (
      existingProd &&
      existingProd.completed_quantity > 0 &&
      [
        "stitching",
        "printing",
        "embroidering",
        "checking",
        "ironing_packing",
        "production_completed",
      ].includes(existingProd.stage)
    ) {
      return {
        error: "Production sequence is locked because production has started.",
      };
    }

    // Call atomic RPC
    const { data, error } = await supabase.rpc("save_order_production_workflow", {
      p_order_id: orderId,
      p_stage_keys: stageKeys,
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save workflow" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return { success: true, message: "Production workflow updated successfully." };
  } catch (err: unknown) {
    console.error("saveOrderWorkflow unexpected error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to save production workflow",
    };
  }
}

export async function saveOrderProductionSequenceAction(
  orderId: string,
  middleStages: string[]
): Promise<{
  success?: boolean;
  error?: string;
  message?: string;
  workflows?: OrderWorkflowStage[];
  firstStageKey?: string;
}> {
  try {
    await requireAdmin();

    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    if (!Array.isArray(middleStages) || middleStages.length !== 3) {
      return { error: "Production sequence must contain exactly 3 stages." };
    }

    const expectedStages = ["stitching", "printing", "embroidering"];
    const providedStages = new Set(middleStages);

    if (
      providedStages.size !== 3 ||
      !expectedStages.every((stage) => providedStages.has(stage))
    ) {
      return {
        error:
          "Production sequence must contain exactly Stitching, Printing, and Embroidering without duplicates.",
      };
    }

    const fullSequence = [
      "stock_sizes",
      "inventory",
      "cutting",
      middleStages[0],
      middleStages[1],
      middleStages[2],
      "checking",
      "ironing_packing",
    ];

    const saveRes = await saveOrderWorkflow(orderId, fullSequence);
    if (saveRes.error) {
      return { error: saveRes.error };
    }

    const supabase = await createClient();
    const { data: updatedWorkflows } = await supabase
      .from("order_production_workflows")
      .select("*")
      .eq("order_id", orderId)
      .order("sequence_order", { ascending: true });

    return {
      success: true,
      message: "Production sequence saved successfully.",
      workflows: (updatedWorkflows || []) as OrderWorkflowStage[],
      firstStageKey: middleStages[0],
    };
  } catch (err: unknown) {
    console.error("saveOrderProductionSequenceAction error:", err);
    return {
      error:
        err instanceof Error ? err.message : "Failed to save production sequence",
    };
  }
}

export async function getOrderWorkflow(orderId: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (!order) {
      return { error: "Order not found" };
    }

    let { data: workflows } = await supabase
      .from("order_production_workflows")
      .select("*")
      .eq("order_id", orderId)
      .order("sequence_order", { ascending: true });

    // If none exists, auto-seed default 8 stages
    if (!workflows || workflows.length === 0) {
      const defaultRows = DEFAULT_PRODUCTION_SEQUENCE.map((stage_key, idx) => ({
        order_id: orderId,
        stage_key,
        sequence_order: idx + 1,
        status: "pending" as const,
      }));
      const { data: inserted } = await supabase
        .from("order_production_workflows")
        .insert(defaultRows)
        .select("*")
        .order("sequence_order", { ascending: true });
      workflows = inserted || [];
    }

    const lockedStatuses = [
      "quality_check",
      "packed",
      "dispatched",
      "in_transit",
      "delivered",
      "cancelled",
    ];
    const isLockedByStatus = lockedStatuses.includes(order.status);
    const hasStartedMiddleOrFinal = (workflows || []).some(
      (w) =>
        w.sequence_order >= 4 &&
        (w.status === "in_progress" || w.status === "completed")
    );

    const { data: existingProd } = await supabase
      .from("production_records")
      .select("id, stage, completed_quantity")
      .eq("order_id", orderId)
      .maybeSingle();

    const hasActiveMiddleWithWork = !!(
      existingProd &&
      existingProd.completed_quantity > 0 &&
      [
        "stitching",
        "printing",
        "embroidering",
        "checking",
        "ironing_packing",
        "production_completed",
      ].includes(existingProd.stage)
    );

    const isLocked =
      isLockedByStatus || hasStartedMiddleOrFinal || hasActiveMiddleWithWork;

    return {
      workflows: (workflows || []) as OrderWorkflowStage[],
      isLocked,
    };
  } catch (err: unknown) {
    console.error("getOrderWorkflow unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to load workflow" };
  }
}


export async function startProduction(orderId: string, initialRemarks?: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // Call atomic RPC
    const { data, error } = await supabase.rpc("start_production", {
      p_order_id: orderId,
      p_remarks: initialRemarks?.trim() || null,
    });

    if (error || (data && !data.success)) {
      console.error("startProduction RPC error:", error || data?.error);
      return { error: data?.error || error?.message || "Failed to start production" };
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

    // If advancing to production_completed, ensure completed_quantity matches total_quantity
    if (nextStage === "production_completed") {
      const { data: prodRec } = await supabase
        .from("production_records")
        .select("total_quantity, completed_quantity")
        .eq("order_id", orderId)
        .maybeSingle();

      if (prodRec && prodRec.completed_quantity < prodRec.total_quantity) {
        await supabase
          .from("production_records")
          .update({
            completed_quantity: prodRec.total_quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", orderId);
      }
    }

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

export interface SaveInventoryItemInput {
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  gram_per_piece: number;
}

export async function saveOrderInventoryMaterialsAction(
  orderId: string,
  items: SaveInventoryItemInput[]
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No inventory items to save" };
    }

    for (const item of items) {
      if (!item.item_name || typeof item.item_name !== "string" || item.item_name.trim() === "") {
        return { error: "Item name is required for all rows" };
      }
      const gram = Number(item.gram_per_piece);
      if (isNaN(gram) || !isFinite(gram) || gram <= 0) {
        return {
          error: `Invalid gram per piece for ${item.item_name}. Must be a positive number greater than 0.`,
        };
      }
      if (gram > 50000) {
        return {
          error: `Gram per piece for ${item.item_name} exceeds realistic threshold (maximum 50,000 g).`,
        };
      }
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_order_inventory_materials", {
      p_order_id: orderId,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        gram_per_piece: Number(it.gram_per_piece),
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save inventory materials" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true, savedCount: data.saved_count };
  } catch (err: unknown) {
    console.error("saveOrderInventoryMaterialsAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save inventory materials" };
  }
}

export async function completeInventoryStageAction(orderId: string, note?: string) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const res = await updateProductionStage(
      orderId,
      "cutting",
      note || "Inventory material requirement verified and completed."
    );
    return res;
  } catch (err: unknown) {
    console.error("completeInventoryStageAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete inventory stage" };
  }
}

export interface SaveCuttingItemInput {
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  cut_quantity: number;
}

export async function saveOrderCuttingItemsAction(
  orderId: string,
  items: SaveCuttingItemInput[]
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No cutting items to save" };
    }

    for (const item of items) {
      if (!item.item_name || typeof item.item_name !== "string" || item.item_name.trim() === "") {
        return { error: "Item name is required for all rows" };
      }
      if (!item.size || typeof item.size !== "string" || item.size.trim() === "") {
        return { error: "Size is required for all rows" };
      }
      const cut = Number(item.cut_quantity);
      if (isNaN(cut) || !Number.isInteger(cut) || cut < 0) {
        return {
          error: `Invalid cut quantity (${item.cut_quantity}) for ${item.item_name} size ${item.size}. Must be a non-negative whole number.`,
        };
      }
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_order_cutting_items", {
      p_order_id: orderId,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        size: it.size.trim(),
        cut_quantity: Math.floor(Number(it.cut_quantity)),
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save cutting data" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true, savedCount: data.saved_count };
  } catch (err: unknown) {
    console.error("saveOrderCuttingItemsAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save cutting data" };
  }
}

export async function completeCuttingStageAction(
  orderId: string,
  note?: string
): Promise<{
  success?: boolean;
  error?: string;
  stage?: string;
  workflows?: OrderWorkflowStage[];
}> {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const supabase = await createClient();

    // Read the saved production sequence for THIS ORDER to determine the first dynamic stage
    const { data: seq4 } = await supabase
      .from("order_production_workflows")
      .select("stage_key")
      .eq("order_id", orderId)
      .eq("sequence_order", 4)
      .maybeSingle();

    const targetNextStage = seq4?.stage_key || "stitching";

    const res = await updateProductionStage(
      orderId,
      targetNextStage,
      note || `Cutting stage completed. Next stage is ${targetNextStage}.`
    );

    if (res.error) {
      return res;
    }

    const { data: updatedWorkflows } = await supabase
      .from("order_production_workflows")
      .select("*")
      .eq("order_id", orderId)
      .order("sequence_order", { ascending: true });

    return {
      ...res,
      workflows: (updatedWorkflows || []) as OrderWorkflowStage[],
    };
  } catch (err: unknown) {
    console.error("completeCuttingStageAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete cutting stage" };
  }
}

export interface SaveStageItemInput {
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  input_quantity: number;
  actual_quantity: number;
}

export async function saveOrderStageItemsAction(
  orderId: string,
  stageKey: string,
  items: SaveStageItemInput[]
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!stageKey || typeof stageKey !== "string") {
      return { error: "Invalid stage key" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No stage items to save" };
    }

    for (const item of items) {
      if (!item.item_name || typeof item.item_name !== "string" || item.item_name.trim() === "") {
        return { error: "Item name is required for all rows" };
      }
      if (!item.size || typeof item.size !== "string" || item.size.trim() === "") {
        return { error: "Size is required for all rows" };
      }
      const actual = Number(item.actual_quantity);
      const input = Number(item.input_quantity);
      if (isNaN(actual) || !isFinite(actual) || actual < 0) {
        return {
          error: `Invalid actual quantity for ${item.item_name} (${item.size}). Must be 0 or greater.`,
        };
      }
      if (actual > input) {
        return {
          error: `Actual mistaked quantity (${actual}) cannot exceed input quantity (${input}) for ${item.item_name} (${item.size}).`,
        };
      }
    }

    const supabase = await createClient();

    // Authoritative Server-Side Validation: Ensure client-submitted input_quantity matches previous stage output
    const { data: workflowData } = await supabase
      .from("order_production_workflows")
      .select("stage_key, sequence_order")
      .eq("order_id", orderId)
      .order("sequence_order", { ascending: true });

    if (workflowData && workflowData.length > 0) {
      const currentWf = workflowData.find((w) => w.stage_key === stageKey);
      if (currentWf && currentWf.sequence_order >= 4 && currentWf.sequence_order <= 7) {
        const prevSeq = currentWf.sequence_order - 1;
        const prevWf = workflowData.find((w) => w.sequence_order === prevSeq);

        if (prevWf?.stage_key === "cutting") {
          const { data: cuttingItems } = await supabase
            .from("order_cutting_items")
            .select("item_name, style_id, style_name, color, size, cut_quantity")
            .eq("order_id", orderId);

          for (const item of items) {
            const clientInput = Math.floor(Number(item.input_quantity));
            const match = (cuttingItems || []).find((ci) => {
              const ciItem = (ci.item_name || "").trim().toLowerCase();
              const itItem = item.item_name.trim().toLowerCase();
              const ciStyleId = (ci.style_id ? String(ci.style_id) : "").trim().toLowerCase();
              const itStyleId = (item.style_id ? String(item.style_id) : "").trim().toLowerCase();
              const normCiStyleId = ciStyleId === "none" || ciStyleId === "no_style_id" ? "" : ciStyleId;
              const normItStyleId = itStyleId === "none" || itStyleId === "no_style_id" ? "" : itStyleId;
              const ciStyleName = (ci.style_name || "").trim().toLowerCase();
              const itStyleName = (item.style_name || "").trim().toLowerCase();
              const normCiStyleName = ciStyleName === "no_style_name" ? "" : ciStyleName;
              const normItStyleName = itStyleName === "no_style_name" ? "" : itStyleName;
              const ciColor = (ci.color || "").trim().toLowerCase();
              const itColor = (item.color || "").trim().toLowerCase();
              const normCiColor = ciColor === "no_color" ? "" : ciColor;
              const normItColor = itColor === "no_color" ? "" : itColor;
              const ciSize = (ci.size || "").trim().toLowerCase();
              const itSize = item.size.trim().toLowerCase();

              return (
                ciItem === itItem &&
                normCiStyleId === normItStyleId &&
                normCiStyleName === normItStyleName &&
                normCiColor === normItColor &&
                ciSize === itSize
              );
            });

            const authInput = match && typeof match.cut_quantity === "number" ? match.cut_quantity : 0;
            if (authInput <= 0) {
              return {
                error: `Cannot save operational row for ${item.item_name} (${item.size}) because previous stage produced 0 output.`,
              };
            }
            if (clientInput !== authInput) {
              return { error: "Stage input does not match the previous stage output." };
            }
          }
        } else if (prevWf) {
          const { data: prevStageItems } = await supabase
            .from("order_stage_items")
            .select("item_name, style_id, style_name, color, size, input_quantity, actual_quantity, result_quantity")
            .eq("order_id", orderId)
            .eq("stage_key", prevWf.stage_key);

          for (const item of items) {
            const clientInput = Math.floor(Number(item.input_quantity));
            const match = (prevStageItems || []).find((si) => {
              const siItem = (si.item_name || "").trim().toLowerCase();
              const itItem = item.item_name.trim().toLowerCase();
              const siStyleId = (si.style_id ? String(si.style_id) : "").trim().toLowerCase();
              const itStyleId = (item.style_id ? String(item.style_id) : "").trim().toLowerCase();
              const normSiStyleId = siStyleId === "none" || siStyleId === "no_style_id" ? "" : siStyleId;
              const normItStyleId = itStyleId === "none" || itStyleId === "no_style_id" ? "" : itStyleId;
              const siStyleName = (si.style_name || "").trim().toLowerCase();
              const itStyleName = (item.style_name || "").trim().toLowerCase();
              const normSiStyleName = siStyleName === "no_style_name" ? "" : siStyleName;
              const normItStyleName = itStyleName === "no_style_name" ? "" : itStyleName;
              const siColor = (si.color || "").trim().toLowerCase();
              const itColor = (item.color || "").trim().toLowerCase();
              const normSiColor = siColor === "no_color" ? "" : siColor;
              const normItColor = itColor === "no_color" ? "" : itColor;
              const siSize = (si.size || "").trim().toLowerCase();
              const itSize = item.size.trim().toLowerCase();

              return (
                siItem === itItem &&
                normSiStyleId === normItStyleId &&
                normSiStyleName === normItStyleName &&
                normSiColor === normItColor &&
                siSize === itSize
              );
            });

            let authInput = 0;
            if (match) {
              if (typeof match.result_quantity === "number" && !isNaN(match.result_quantity)) {
                authInput = Math.max(0, match.result_quantity);
              } else if (typeof match.input_quantity === "number" && typeof match.actual_quantity === "number") {
                authInput = Math.max(0, match.input_quantity - match.actual_quantity);
              }
            }

            if (authInput <= 0) {
              return {
                error: `Cannot save operational row for ${item.item_name} (${item.size}) because previous stage produced 0 output.`,
              };
            }
            if (clientInput !== authInput) {
              return { error: "Stage input does not match the previous stage output." };
            }
          }
        }
      }
    }

    const { data, error } = await supabase.rpc("save_order_stage_items", {
      p_order_id: orderId,
      p_stage_key: stageKey,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        size: it.size.trim(),
        input_quantity: Math.floor(Number(it.input_quantity)),
        actual_quantity: Math.floor(Number(it.actual_quantity)),
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || `Failed to save ${stageKey} data` };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true, savedCount: data.saved_count };
  } catch (err: unknown) {
    console.error("saveOrderStageItemsAction error:", err);
    return { error: err instanceof Error ? err.message : `Failed to save ${stageKey} data` };
  }
}

export async function completeOrderStageAction(
  orderId: string,
  stageKey: string,
  note?: string
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!stageKey || typeof stageKey !== "string") {
      return { error: "Invalid stage key" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_order_stage", {
      p_order_id: orderId,
      p_stage_key: stageKey,
      p_note: note?.trim() || null,
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || `Failed to complete ${stageKey} stage` };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      completedStage: data.completed_stage,
      nextStage: data.next_stage,
    };
  } catch (err: unknown) {
    console.error("completeOrderStageAction error:", err);
    return { error: err instanceof Error ? err.message : `Failed to complete ${stageKey} stage` };
  }
}

export async function saveOrderCheckingItemsAction(
  orderId: string,
  items: Array<{
    item_name: string;
    style_id?: string | null;
    style_name?: string | null;
    color?: string | null;
    size: string;
    input_quantity?: number | null;
    passed_quantity?: number | null;
    remarks?: string | null;
  }>
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No checking items provided to save" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_order_checking_items", {
      p_order_id: orderId,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        size: it.size.trim(),
        input_quantity:
          it.input_quantity !== undefined && it.input_quantity !== null
            ? Math.floor(Number(it.input_quantity))
            : null,
        passed_quantity:
          it.passed_quantity !== undefined && it.passed_quantity !== null
            ? Math.floor(Number(it.passed_quantity))
            : null,
        remarks: it.remarks?.trim() || null,
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save checking items" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true, savedCount: data.saved_count };
  } catch (err: unknown) {
    console.error("saveOrderCheckingItemsAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save checking items" };
  }
}

export async function completeOrderCheckingAction(orderId: string, note?: string) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_order_checking_stage", {
      p_order_id: orderId,
      p_note: note?.trim() || null,
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to complete checking stage" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      completedStage: data.completed_stage,
      nextStage: data.next_stage,
    };
  } catch (err: unknown) {
    console.error("completeOrderCheckingAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete checking stage" };
  }
}

export async function saveOrderIroningItemsAction(
  orderId: string,
  items: Array<{
    item_name: string;
    style_id?: string | null;
    style_name?: string | null;
    color?: string | null;
    size: string;
    input_quantity?: number | null;
    actual_quantity: number;
    remarks?: string | null;
  }>
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No ironing items provided to save" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_order_ironing_items", {
      p_order_id: orderId,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        size: it.size.trim(),
        input_quantity:
          it.input_quantity !== undefined && it.input_quantity !== null
            ? Math.floor(Number(it.input_quantity))
            : null,
        actual_quantity:
          it.actual_quantity !== undefined && it.actual_quantity !== null
            ? Math.floor(Number(it.actual_quantity))
            : null,
        remarks: it.remarks?.trim() || null,
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save ironing items" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return {
      success: true,
      isIroningCompleted: data?.is_ironing_completed ?? false,
    };
  } catch (err: unknown) {
    console.error("saveOrderIroningItemsAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save ironing items" };
  }
}

export async function completeOrderIroningStepAction(orderId: string, note?: string) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_order_ironing_step", {
      p_order_id: orderId,
      p_note: note?.trim() || null,
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to complete ironing step" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      isIroningCompleted: data.is_ironing_completed,
      ironingCompletedAt: data.ironing_completed_at,
    };
  } catch (err: unknown) {
    console.error("completeOrderIroningStepAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete ironing step" };
  }
}

export async function saveOrderPackingItemsAction(
  orderId: string,
  items: Array<{
    item_name: string;
    style_id?: string | null;
    style_name?: string | null;
    color?: string | null;
    size: string;
    input_quantity?: number | null;
    actual_quantity: number;
    remarks?: string | null;
  }>
) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "No packing items provided to save" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("save_order_packing_items", {
      p_order_id: orderId,
      p_items: items.map((it) => ({
        item_name: it.item_name.trim(),
        style_id: it.style_id || null,
        style_name: it.style_name?.trim() || null,
        color: it.color?.trim() || null,
        size: it.size.trim(),
        input_quantity:
          it.input_quantity !== undefined && it.input_quantity !== null
            ? Math.floor(Number(it.input_quantity))
            : null,
        actual_quantity:
          it.actual_quantity !== undefined && it.actual_quantity !== null
            ? Math.floor(Number(it.actual_quantity))
            : null,
        remarks: it.remarks?.trim() || null,
      })),
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to save packing items" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);

    return { success: true };
  } catch (err: unknown) {
    console.error("saveOrderPackingItemsAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save packing items" };
  }
}

export async function completeOrderPackingStepAction(orderId: string, note?: string) {
  try {
    await requireAdmin();
    if (!orderId || typeof orderId !== "string") {
      return { error: "Invalid order ID" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_order_packing_step", {
      p_order_id: orderId,
      p_note: note?.trim() || null,
    });

    if (error || (data && !data.success)) {
      return { error: data?.error || error?.message || "Failed to complete packing step" };
    }

    revalidatePath("/admin/production");
    revalidatePath(`/admin/production/${orderId}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);

    return {
      success: true,
      completedStage: data.completed_stage,
      orderStatus: data.order_status,
      totalPacked: data.total_packed,
    };
  } catch (err: unknown) {
    console.error("completeOrderPackingStepAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to complete packing step" };
  }
}




