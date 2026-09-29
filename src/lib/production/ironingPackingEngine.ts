/**
 * ironingPackingEngine.ts
 *
 * Core calculation and validation engine for Stage 8 — Ironing & Packing.
 *
 * WORKFLOW:
 * Final Dynamic Stage -> Checking (Passed Quantity) -> Ironing (Ironed Quantity) -> Packing (Packed Quantity) -> Order = Packed.
 *
 * RULES:
 * 1. Ironing Input derives strictly from Checking Passed Quantity (where passed_quantity > 0).
 * 2. Zero-output rule: Rows with passed_quantity = 0 do not appear as operational Ironing rows.
 * 3. Packing remains locked until Ironing is 100% completed (ironed == input, pending == 0 on all rows).
 * 4. Packing Input derives strictly from Ironing Actual Output (ironed_quantity > 0).
 * 5. Admin enters only Ironed Quantity in Ironing and Packed Quantity in Packing.
 * 6. 0 is strictly a valid entered quantity. Blank/empty is incomplete.
 * 7. Negative or greater than input is invalid.
 * 8. Order, Item, Style, Color, Size remain strictly isolated throughout.
 */

import { OrderWorkflowStage } from "../productionWorkflow";
import { StoredCheckingItem } from "./checkingEngine";

export interface StoredIroningPackingItem {
  id?: string;
  order_id: string;
  stage_key: "ironing" | "packing";
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  input_quantity: number;
  actual_quantity: number;
  pending_quantity: number;
  remarks?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export type IroningPackingRowStatus =
  | "enter_quantities"
  | "pending"
  | "complete"
  | "invalid";

export interface IroningPackingSizeRow {
  rowKey: string;
  size: string;
  inputQuantity: number;
  actualQuantity: number | null; // ironed or packed
  pendingQuantity: number | null;
  remarks: string;
  status: IroningPackingRowStatus;
  statusText: string;
  isValid: boolean;
  isComplete: boolean;
  errorMessage?: string;
}

export interface IroningPackingGroupSection {
  groupKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  displayName: string;
  totalInput: number;
  totalActual: number;
  totalPending: number;
  isGroupComplete: boolean;
  sizeRows: IroningPackingSizeRow[];
}

export interface IroningCalculationResult {
  hasOperationalPieces: boolean;
  groups: IroningPackingGroupSection[];
  totalInputPieces: number;
  totalIronedPieces: number;
  totalPendingPieces: number;
  allSizesComplete: boolean;
  canComplete: boolean;
  totalRequiredSizesCount: number;
  totalCompletedSizesCount: number;
  emptyStateMessage?: string;
}

export interface PackingCalculationResult {
  isLocked: boolean;
  hasOperationalPieces: boolean;
  groups: IroningPackingGroupSection[];
  totalInputPieces: number;
  totalPackedPieces: number;
  totalPendingPieces: number;
  allSizesComplete: boolean;
  canComplete: boolean;
  totalRequiredSizesCount: number;
  totalCompletedSizesCount: number;
  emptyStateMessage?: string;
}

export function buildIroningPackingGroupKey(
  itemName: string,
  styleId: string | null,
  styleName: string | null,
  color: string | null
): string {
  const cleanItem = itemName.trim().toLowerCase();
  const cleanStyleId = styleId ? styleId.trim() : "no_style_id";
  const cleanStyleName = styleName ? styleName.trim().toLowerCase() : "no_style_name";
  const cleanColor = color ? color.trim().toLowerCase() : "no_color";
  return `${cleanItem}:::${cleanStyleId}:::${cleanStyleName}:::${cleanColor}`;
}

export function buildIroningPackingSizeRowKey(groupKey: string, size: string): string {
  return `${groupKey}:::${size.trim().toLowerCase()}`;
}

export function sortSizes(sizes: string[]): string[] {
  const numericMap = new Map<string, number>();
  sizes.forEach((s) => {
    const num = parseFloat(s);
    if (!isNaN(num) && /^\d+(\.\d+)?$/.test(s.trim())) {
      numericMap.set(s, num);
    }
  });

  return [...sizes].sort((a, b) => {
    const aNum = numericMap.get(a);
    const bNum = numericMap.get(b);
    if (aNum !== undefined && bNum !== undefined) {
      return aNum - bNum;
    }
    if (aNum !== undefined) return -1;
    if (bNum !== undefined) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

/**
 * Calculates the Ironing step of Stage 8.
 * Consumes ONLY positive passed quantities from Checking.
 */
export function calculateIroningStep({
  savedCheckingItems,
  savedIroningItems = [],
  liveInputs = {},
}: {
  savedCheckingItems: StoredCheckingItem[];
  savedIroningItems?: StoredIroningPackingItem[];
  liveInputs?: {
    ironedInputs?: Record<string, string>; // rowKey -> value string
    remarksInputs?: Record<string, string>;
  };
}): IroningCalculationResult {
  // 1. Filter checking items: ONLY passed_quantity > 0
  const positiveCheckingItems = (savedCheckingItems || []).filter(
    (ci) => (ci.passed_quantity || 0) > 0
  );

  if (positiveCheckingItems.length === 0) {
    return {
      hasOperationalPieces: false,
      groups: [],
      totalInputPieces: 0,
      totalIronedPieces: 0,
      totalPendingPieces: 0,
      allSizesComplete: false,
      canComplete: false,
      totalRequiredSizesCount: 0,
      totalCompletedSizesCount: 0,
      emptyStateMessage: "No pieces are available for ironing.",
    };
  }

  // 2. Build saved values maps
  const savedActualMap = new Map<string, number>();
  const savedRemarksMap = new Map<string, string>();

  savedIroningItems.forEach((si) => {
    if (si.stage_key !== "ironing") return;
    const gKey = buildIroningPackingGroupKey(
      si.item_name,
      si.style_id || null,
      si.style_name || null,
      si.color || null
    );
    const rKey = buildIroningPackingSizeRowKey(gKey, si.size);

    const parseNum = (raw: unknown): number | null => {
      if (typeof raw === "number" && !isNaN(raw)) return raw;
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        const n = Number(raw);
        if (!isNaN(n)) return n;
      }
      return null;
    };

    const actual = parseNum(si.actual_quantity);
    if (actual !== null) savedActualMap.set(rKey, actual);

    if (si.remarks && si.remarks.trim()) {
      savedRemarksMap.set(rKey, si.remarks.trim());
    }
  });

  // Apply live inputs over saved
  const actualLookup = new Map<string, number>(savedActualMap);
  const remarksLookup = new Map<string, string>(savedRemarksMap);

  if (liveInputs.ironedInputs) {
    Object.entries(liveInputs.ironedInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        const trimmed = val.trim();
        if (trimmed !== "" && /^-?\d+$/.test(trimmed)) {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num)) {
            actualLookup.set(rKey, num);
          }
        } else if (trimmed === "") {
          actualLookup.delete(rKey);
        }
      }
    });
  }

  if (liveInputs.remarksInputs) {
    Object.entries(liveInputs.remarksInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        remarksLookup.set(rKey, val);
      }
    });
  }

  // 3. Aggregate checking items into groups
  interface GroupAcc {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, number>; // size -> authoritative input (passed_quantity)
  }

  const groupAccMap = new Map<string, GroupAcc>();

  positiveCheckingItems.forEach((ci) => {
    const rawItem = (ci.item_name || "Uniform Item").trim();
    const rawStyleId = ci.style_id ? ci.style_id.trim() : null;
    const rawStyleName = ci.style_name ? ci.style_name.trim() : null;
    const rawColor = ci.color ? ci.color.trim() : null;
    const rawSize = (ci.size || "Standard").trim();
    const gKey = buildIroningPackingGroupKey(rawItem, rawStyleId, rawStyleName, rawColor);

    if (!groupAccMap.has(gKey)) {
      groupAccMap.set(gKey, {
        itemName: rawItem,
        styleId: rawStyleId,
        styleName: rawStyleName,
        color: rawColor,
        sizes: new Map(),
      });
    }

    const grp = groupAccMap.get(gKey)!;
    const prevVal = grp.sizes.get(rawSize) || 0;
    grp.sizes.set(rawSize, prevVal + (ci.passed_quantity || 0));
  });

  const groupSections: IroningPackingGroupSection[] = [];
  let totalInputPieces = 0;
  let totalIronedPieces = 0;
  let totalPendingPieces = 0;
  let totalRequiredSizesCount = 0;
  let totalCompletedSizesCount = 0;

  Array.from(groupAccMap.entries()).forEach(([groupKey, grp]) => {
    const cleanStyleName = grp.styleName || "Standard Style";
    const displayColor = grp.color || "Standard Color";
    const displayName = `${grp.itemName} — ${cleanStyleName} (${displayColor})`;

    const sortedSizes = sortSizes(Array.from(grp.sizes.keys()));

    let groupInputTotal = 0;
    let groupActualSum = 0;
    let groupPendingSum = 0;
    let groupCompletedCount = 0;

    const sizeRows: IroningPackingSizeRow[] = sortedSizes.map((size) => {
      totalRequiredSizesCount += 1;
      const inputQty = grp.sizes.get(size) || 0;
      const rowKey = buildIroningPackingSizeRowKey(groupKey, size);

      const hasActual = actualLookup.has(rowKey);
      const actualQty = hasActual ? (actualLookup.get(rowKey) as number) : null;
      const remarks = remarksLookup.get(rowKey) || "";

      groupInputTotal += inputQty;
      totalInputPieces += inputQty;

      let pendingQty: number | null = null;
      let status: IroningPackingRowStatus = "enter_quantities";
      let statusText = "Enter Ironed";
      let isValid = false;
      let isComplete = false;
      let errorMessage: string | undefined = undefined;

      if (!hasActual || actualQty === null) {
        status = "enter_quantities";
        statusText = "Incomplete";
        pendingQty = null;
      } else if (actualQty < 0) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Ironed quantity cannot be negative.";
        pendingQty = null;
      } else if (actualQty > inputQty) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Ironed quantity cannot be greater than input quantity.";
        pendingQty = null;
      } else {
        // Valid 0 <= actualQty <= inputQty
        pendingQty = inputQty - actualQty;
        if (actualQty === inputQty && pendingQty === 0) {
          status = "complete";
          statusText = "Complete";
          isValid = true;
          isComplete = true;
          groupCompletedCount += 1;
          totalCompletedSizesCount += 1;
        } else {
          status = "pending";
          statusText = "Pending";
          isValid = true;
          isComplete = false;
        }

        groupActualSum += actualQty;
        totalIronedPieces += actualQty;

        groupPendingSum += pendingQty;
        totalPendingPieces += pendingQty;
      }

      return {
        rowKey,
        size,
        inputQuantity: inputQty,
        actualQuantity: actualQty,
        pendingQuantity: pendingQty,
        remarks,
        status,
        statusText,
        isValid,
        isComplete,
        errorMessage,
      };
    });

    groupSections.push({
      groupKey,
      itemName: grp.itemName,
      styleId: grp.styleId,
      styleName: grp.styleName,
      color: grp.color,
      displayName,
      totalInput: groupInputTotal,
      totalActual: groupActualSum,
      totalPending: groupPendingSum,
      isGroupComplete: groupCompletedCount === sizeRows.length,
      sizeRows,
    });
  });

  const allSizesComplete =
    totalRequiredSizesCount > 0 &&
    totalCompletedSizesCount === totalRequiredSizesCount &&
    totalPendingPieces === 0;

  return {
    hasOperationalPieces: true,
    groups: groupSections,
    totalInputPieces,
    totalIronedPieces,
    totalPendingPieces,
    allSizesComplete,
    canComplete: allSizesComplete,
    totalRequiredSizesCount,
    totalCompletedSizesCount,
  };
}

/**
 * Calculates the Packing step of Stage 8.
 * Consumes ONLY positive actual quantities from Ironing (ironed_quantity > 0).
 * Locked until Ironing is completed.
 */
export function calculatePackingStep({
  isIroningCompleted,
  savedIroningItems = [],
  savedPackingItems = [],
  liveInputs = {},
}: {
  isIroningCompleted: boolean;
  savedIroningItems?: StoredIroningPackingItem[];
  savedPackingItems?: StoredIroningPackingItem[];
  liveInputs?: {
    packedInputs?: Record<string, string>; // rowKey -> value string
    remarksInputs?: Record<string, string>;
  };
}): PackingCalculationResult {
  if (!isIroningCompleted) {
    return {
      isLocked: true,
      hasOperationalPieces: false,
      groups: [],
      totalInputPieces: 0,
      totalPackedPieces: 0,
      totalPendingPieces: 0,
      allSizesComplete: false,
      canComplete: false,
      totalRequiredSizesCount: 0,
      totalCompletedSizesCount: 0,
      emptyStateMessage: "Packing is locked until Ironing is completed.",
    };
  }

  // 1. Filter ironing items: ONLY stage_key === 'ironing' AND actual_quantity > 0
  const positiveIroningItems = (savedIroningItems || []).filter(
    (si) => si.stage_key === "ironing" && (si.actual_quantity || 0) > 0
  );

  if (positiveIroningItems.length === 0) {
    return {
      isLocked: false,
      hasOperationalPieces: false,
      groups: [],
      totalInputPieces: 0,
      totalPackedPieces: 0,
      totalPendingPieces: 0,
      allSizesComplete: false,
      canComplete: false,
      totalRequiredSizesCount: 0,
      totalCompletedSizesCount: 0,
      emptyStateMessage: "No pieces are available for packing.",
    };
  }

  // 2. Build saved values maps for Packing
  const savedActualMap = new Map<string, number>();
  const savedRemarksMap = new Map<string, string>();

  savedPackingItems.forEach((pi) => {
    if (pi.stage_key !== "packing") return;
    const gKey = buildIroningPackingGroupKey(
      pi.item_name,
      pi.style_id || null,
      pi.style_name || null,
      pi.color || null
    );
    const rKey = buildIroningPackingSizeRowKey(gKey, pi.size);

    const parseNum = (raw: unknown): number | null => {
      if (typeof raw === "number" && !isNaN(raw)) return raw;
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        const n = Number(raw);
        if (!isNaN(n)) return n;
      }
      return null;
    };

    const actual = parseNum(pi.actual_quantity);
    if (actual !== null) savedActualMap.set(rKey, actual);

    if (pi.remarks && pi.remarks.trim()) {
      savedRemarksMap.set(rKey, pi.remarks.trim());
    }
  });

  // Apply live inputs over saved
  const actualLookup = new Map<string, number>(savedActualMap);
  const remarksLookup = new Map<string, string>(savedRemarksMap);

  if (liveInputs.packedInputs) {
    Object.entries(liveInputs.packedInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        const trimmed = val.trim();
        if (trimmed !== "" && /^-?\d+$/.test(trimmed)) {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num)) {
            actualLookup.set(rKey, num);
          }
        } else if (trimmed === "") {
          actualLookup.delete(rKey);
        }
      }
    });
  }

  if (liveInputs.remarksInputs) {
    Object.entries(liveInputs.remarksInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        remarksLookup.set(rKey, val);
      }
    });
  }

  // 3. Aggregate ironing items into groups
  interface GroupAcc {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, number>; // size -> authoritative input (ironed_quantity)
  }

  const groupAccMap = new Map<string, GroupAcc>();

  positiveIroningItems.forEach((ii) => {
    const rawItem = (ii.item_name || "Uniform Item").trim();
    const rawStyleId = ii.style_id ? ii.style_id.trim() : null;
    const rawStyleName = ii.style_name ? ii.style_name.trim() : null;
    const rawColor = ii.color ? ii.color.trim() : null;
    const rawSize = (ii.size || "Standard").trim();
    const gKey = buildIroningPackingGroupKey(rawItem, rawStyleId, rawStyleName, rawColor);

    if (!groupAccMap.has(gKey)) {
      groupAccMap.set(gKey, {
        itemName: rawItem,
        styleId: rawStyleId,
        styleName: rawStyleName,
        color: rawColor,
        sizes: new Map(),
      });
    }

    const grp = groupAccMap.get(gKey)!;
    const prevVal = grp.sizes.get(rawSize) || 0;
    grp.sizes.set(rawSize, prevVal + (ii.actual_quantity || 0));
  });

  const groupSections: IroningPackingGroupSection[] = [];
  let totalInputPieces = 0;
  let totalPackedPieces = 0;
  let totalPendingPieces = 0;
  let totalRequiredSizesCount = 0;
  let totalCompletedSizesCount = 0;

  Array.from(groupAccMap.entries()).forEach(([groupKey, grp]) => {
    const cleanStyleName = grp.styleName || "Standard Style";
    const displayColor = grp.color || "Standard Color";
    const displayName = `${grp.itemName} — ${cleanStyleName} (${displayColor})`;

    const sortedSizes = sortSizes(Array.from(grp.sizes.keys()));

    let groupInputTotal = 0;
    let groupActualSum = 0;
    let groupPendingSum = 0;
    let groupCompletedCount = 0;

    const sizeRows: IroningPackingSizeRow[] = sortedSizes.map((size) => {
      totalRequiredSizesCount += 1;
      const inputQty = grp.sizes.get(size) || 0;
      const rowKey = buildIroningPackingSizeRowKey(groupKey, size);

      const hasActual = actualLookup.has(rowKey);
      const actualQty = hasActual ? (actualLookup.get(rowKey) as number) : null;
      const remarks = remarksLookup.get(rowKey) || "";

      groupInputTotal += inputQty;
      totalInputPieces += inputQty;

      let pendingQty: number | null = null;
      let status: IroningPackingRowStatus = "enter_quantities";
      let statusText = "Enter Packed";
      let isValid = false;
      let isComplete = false;
      let errorMessage: string | undefined = undefined;

      if (!hasActual || actualQty === null) {
        status = "enter_quantities";
        statusText = "Incomplete";
        pendingQty = null;
      } else if (actualQty < 0) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Packed quantity cannot be negative.";
        pendingQty = null;
      } else if (actualQty > inputQty) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Packed quantity cannot be greater than input quantity.";
        pendingQty = null;
      } else {
        // Valid 0 <= actualQty <= inputQty
        pendingQty = inputQty - actualQty;
        if (actualQty === inputQty && pendingQty === 0) {
          status = "complete";
          statusText = "Complete";
          isValid = true;
          isComplete = true;
          groupCompletedCount += 1;
          totalCompletedSizesCount += 1;
        } else {
          status = "pending";
          statusText = "Pending";
          isValid = true;
          isComplete = false;
        }

        groupActualSum += actualQty;
        totalPackedPieces += actualQty;

        groupPendingSum += pendingQty;
        totalPendingPieces += pendingQty;
      }

      return {
        rowKey,
        size,
        inputQuantity: inputQty,
        actualQuantity: actualQty,
        pendingQuantity: pendingQty,
        remarks,
        status,
        statusText,
        isValid,
        isComplete,
        errorMessage,
      };
    });

    groupSections.push({
      groupKey,
      itemName: grp.itemName,
      styleId: grp.styleId,
      styleName: grp.styleName,
      color: grp.color,
      displayName,
      totalInput: groupInputTotal,
      totalActual: groupActualSum,
      totalPending: groupPendingSum,
      isGroupComplete: groupCompletedCount === sizeRows.length,
      sizeRows,
    });
  });

  const allSizesComplete =
    totalRequiredSizesCount > 0 &&
    totalCompletedSizesCount === totalRequiredSizesCount &&
    totalPendingPieces === 0;

  return {
    isLocked: false,
    hasOperationalPieces: true,
    groups: groupSections,
    totalInputPieces,
    totalPackedPieces,
    totalPendingPieces,
    allSizesComplete,
    canComplete: allSizesComplete,
    totalRequiredSizesCount,
    totalCompletedSizesCount,
  };
}

/**
 * Checks if the Ironing step is completed for an order based on the workflow record or saved items.
 */
export function isIroningStepCompleted(
  workflow?: (OrderWorkflowStage & { ironing_completed_at?: string | null }) | null,
  savedIroningItems?: StoredIroningPackingItem[],
  savedCheckingItems?: StoredCheckingItem[]
): boolean {
  if (!workflow) return false;
  // If workflow has ironing_completed_at set, it's completed
  if (workflow.ironing_completed_at) return true;
  // If workflow sequence 8 is completed, ironing is completed
  if (workflow.status === "completed") return true;

  // Fallback check against saved ironing items
  if (savedIroningItems && savedIroningItems.length > 0) {
    const ironingItems = savedIroningItems.filter((i) => i.stage_key === "ironing");
    if (ironingItems.length > 0) {
      const allZeroPending = ironingItems.every(
        (i) => i.pending_quantity === 0 && i.actual_quantity === i.input_quantity
      );
      if (allZeroPending) {
        if (savedCheckingItems && savedCheckingItems.length > 0) {
          const positiveChecking = savedCheckingItems.filter((c) => (c.passed_quantity || 0) > 0);
          if (positiveChecking.length > 0) {
            const allCovered = positiveChecking.every((c) =>
              ironingItems.some(
                (i) =>
                  i.item_name.trim().toLowerCase() === c.item_name.trim().toLowerCase() &&
                  i.size.trim().toLowerCase() === c.size.trim().toLowerCase() &&
                  (i.style_id || null) === (c.style_id || null) &&
                  (i.style_name || null) === (c.style_name || null) &&
                  (i.color || null) === (c.color || null) &&
                  i.actual_quantity === c.passed_quantity &&
                  i.pending_quantity === 0
              )
            );
            return allCovered;
          }
        }
        return true;
      }
    }
  }

  return false;
}
