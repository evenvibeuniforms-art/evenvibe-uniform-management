import { OrderWorkflowStage, formatWorkflowStageLabel } from "@/lib/productionWorkflow";
import {
  StoredStageItem,
  getCheckingInputItems,
} from "@/lib/production/dynamicStageEngine";

export interface StoredCheckingItem {
  id?: string;
  order_id: string;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  input_quantity: number;
  passed_quantity: number | null;
  rework_quantity?: number | null; // deprecated / 0
  reject_quantity: number | null;
  remarks?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export type CheckingRowStatus = "enter_quantities" | "incomplete" | "complete" | "invalid";

export interface CheckingSizeRow {
  size: string;
  inputQuantity: number; // Authoritative and READ ONLY from final dynamic stage output
  passedQuantity: number | null;
  rejectQuantity: number | null; // Automatically calculated: Input - Passed (READ ONLY)
  remarks: string;
  status: CheckingRowStatus;
  statusText: string;
  rowKey: string;
  isValid: boolean;
  isComplete: boolean;
  errorMessage?: string;
}

export interface CheckingGroupSection {
  groupKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  cleanStyleName: string;
  displayColor: string;
  displayName: string;
  sizeRows: CheckingSizeRow[];
  inputTotal: number;
  passedTotal: number | null;
  rejectTotal: number | null;
  enteredSizesCount: number;
  totalSizesCount: number;
  allSizesComplete: boolean;
  statusText: string;
}

export interface CheckingCalculationResult {
  finalDynamicStageKey: string | null;
  finalDynamicStageDisplayName: string;
  groups: CheckingGroupSection[];
  totalInputPieces: number;
  totalPassedPieces: number;
  totalRejectPieces: number;
  totalRequiredSizesCount: number;
  totalCompletedSizesCount: number;
  missingSizesCount: number;
  allSizesComplete: boolean;
  canComplete: boolean;
  completionErrorMessage?: string;
}

/**
 * Standard size order ranking
 */
const SIZE_ORDER = [
  "20", "22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48",
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
  "Standard",
];

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const idxA = SIZE_ORDER.indexOf(a);
    const idxB = SIZE_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

/**
 * Unique key for Item + Style + Color group.
 */
export function buildCheckingGroupKey(
  itemName: string,
  styleId?: string | null,
  styleName?: string | null,
  color?: string | null
): string {
  const normItem = (itemName || "Uniform Item").trim().toLowerCase();
  const normStyleId = styleId ? styleId.trim() : "none";
  const normStyleName = styleName ? styleName.trim().toLowerCase() : "none";
  const normColor = color ? color.trim().toLowerCase() : "none";
  return `${normItem}::${normStyleId}::${normStyleName}::${normColor}`;
}

/**
 * Unique key for size within group.
 */
export function buildCheckingSizeRowKey(groupKey: string, size: string): string {
  return `${groupKey}::${(size || "Standard").trim().toLowerCase()}`;
}

export interface CheckingLiveInputs {
  passedInputs?: Record<string, string>;
  remarksInputs?: Record<string, string>;
}

/**
 * Core calculation engine for Stage 7 Checking.
 * 
 * AUTHORITATIVE RULES:
 * 1. Input source is ONLY the final dynamic production stage actual output.
 * 2. Only items with positive physical output (output > 0) reach Checking.
 * 3. Rows with output = 0 are completely excluded.
 * 4. Input quantity is strictly READ ONLY.
 * 5. Admin enters ONLY Passed quantity (0 <= Passed <= Input).
 * 6. Reject quantity is AUTOMATICALLY CALCULATED: Reject = Input - Passed (READ ONLY).
 * 7. 0 is a strictly valid entered quantity. Blank/empty is incomplete.
 * 8. Passed cannot exceed Input. Reject can never be negative.
 * 9. Checking completes ONLY when every positive-input row has a valid Passed quantity.
 */
export function calculateCheckingStage({
  workflows,
  stageItems,
  savedCheckingItems = [],
  liveInputs = {},
}: {
  workflows: OrderWorkflowStage[] | null | undefined;
  stageItems: StoredStageItem[];
  savedCheckingItems?: StoredCheckingItem[];
  liveInputs?: CheckingLiveInputs;
}): CheckingCalculationResult {
  const { finalDynamicStage, items: operationalItems } = getCheckingInputItems({
    workflows,
    stageItems,
  });

  const finalDynamicStageKey = finalDynamicStage?.stage_key || null;
  const finalDynamicStageDisplayName = finalDynamicStageKey
    ? formatWorkflowStageLabel(finalDynamicStageKey)
    : "Final Production Stage";

  // Build maps of saved checking quantities
  const savedPassedMap = new Map<string, number>();
  const savedRemarksMap = new Map<string, string>();

  (savedCheckingItems || []).forEach((ci) => {
    const gKey = buildCheckingGroupKey(ci.item_name, ci.style_id, ci.style_name, ci.color);
    const rKey = buildCheckingSizeRowKey(gKey, ci.size);

    const parseQty = (raw: unknown): number | null => {
      if (typeof raw === "number" && !isNaN(raw)) return raw;
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        const num = Number(raw);
        if (!isNaN(num)) return num;
      }
      return null;
    };

    const p = parseQty(ci.passed_quantity);
    if (p !== null) savedPassedMap.set(rKey, p);

    if (ci.remarks && ci.remarks.trim()) {
      savedRemarksMap.set(rKey, ci.remarks.trim());
    }
  });

  // Apply live inputs over saved
  const passedLookup = new Map<string, number>(savedPassedMap);
  const remarksLookup = new Map<string, string>(savedRemarksMap);

  if (liveInputs.passedInputs) {
    Object.entries(liveInputs.passedInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        const trimmed = val.trim();
        if (trimmed !== "" && /^-?\d+$/.test(trimmed)) {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num)) {
            passedLookup.set(rKey, num);
          }
        } else if (trimmed === "") {
          passedLookup.delete(rKey);
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

  // Aggregate operational items into groups (Item + Style + Color)
  interface GroupAcc {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, number>; // size -> authoritative inputQuantity
  }

  const groupAccMap = new Map<string, GroupAcc>();

  operationalItems.forEach((it) => {
    const rawItem = (it.itemName || "Uniform Item").trim();
    const rawStyleId = it.styleId ? it.styleId.trim() : null;
    const rawStyleName = it.styleName ? it.styleName.trim() : null;
    const rawColor = it.color ? it.color.trim() : null;
    const rawSize = (it.size || "Standard").trim();
    const gKey = buildCheckingGroupKey(rawItem, rawStyleId, rawStyleName, rawColor);

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
    const existingInput = grp.sizes.get(rawSize) || 0;
    grp.sizes.set(rawSize, existingInput + (it.inputQuantity || 0));
  });

  const groupSections: CheckingGroupSection[] = [];
  let totalInputPieces = 0;
  let totalPassedPieces = 0;
  let totalRejectPieces = 0;
  let totalRequiredSizesCount = 0;
  let totalCompletedSizesCount = 0;

  Array.from(groupAccMap.entries()).forEach(([groupKey, grp]) => {
    const cleanStyleName = grp.styleName || "Standard Style";
    const displayColor = grp.color || "Standard Color";
    const displayName = `${grp.itemName} — ${cleanStyleName} (${displayColor})`;

    const sortedSizes = sortSizes(Array.from(grp.sizes.keys()));

    let groupInputTotal = 0;
    let groupPassedSum = 0;
    let groupRejectSum = 0;
    let groupCompletedCount = 0;
    let groupHasPassed = false;
    let groupHasReject = false;

    const sizeRows: CheckingSizeRow[] = sortedSizes.map((size) => {
      totalRequiredSizesCount += 1;
      const inputQty = grp.sizes.get(size) || 0;
      const rowKey = buildCheckingSizeRowKey(groupKey, size);

      const hasPassed = passedLookup.has(rowKey);
      const passedQty = hasPassed ? (passedLookup.get(rowKey) as number) : null;
      const remarks = remarksLookup.get(rowKey) || "";

      groupInputTotal += inputQty;

      let rejectQty: number | null = null;
      let status: CheckingRowStatus = "enter_quantities";
      let statusText = "Enter Passed";
      let isValid = false;
      let isComplete = false;
      let errorMessage: string | undefined = undefined;

      if (!hasPassed || passedQty === null) {
        status = "enter_quantities";
        statusText = "Incomplete";
        rejectQty = null;
      } else if (passedQty < 0) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Passed quantity cannot be negative.";
        rejectQty = null;
      } else if (passedQty > inputQty) {
        status = "invalid";
        statusText = "Invalid";
        errorMessage = "Passed quantity cannot be greater than input quantity.";
        // Reject must NOT calculate / cannot become negative
        rejectQty = null;
      } else {
        // Valid: 0 <= passedQty <= inputQty
        rejectQty = inputQty - passedQty;
        status = "complete";
        statusText = "Complete";
        isValid = true;
        isComplete = true;
        groupCompletedCount += 1;
        totalCompletedSizesCount += 1;

        groupHasPassed = true;
        groupPassedSum += passedQty;
        totalPassedPieces += passedQty;

        groupHasReject = true;
        groupRejectSum += rejectQty;
        totalRejectPieces += rejectQty;
      }

      return {
        size,
        inputQuantity: inputQty,
        passedQuantity: passedQty,
        rejectQuantity: rejectQty,
        remarks,
        status,
        statusText,
        rowKey,
        isValid,
        isComplete,
        errorMessage,
      };
    });

    totalInputPieces += groupInputTotal;

    const allSizesComplete = groupCompletedCount === sortedSizes.length && sortedSizes.length > 0;
    const groupStatusText = allSizesComplete
      ? "Complete"
      : groupCompletedCount > 0
      ? `${groupCompletedCount}/${sortedSizes.length} Complete`
      : "Incomplete";

    groupSections.push({
      groupKey,
      itemName: grp.itemName,
      styleId: grp.styleId,
      styleName: grp.styleName,
      color: grp.color,
      cleanStyleName,
      displayColor,
      displayName,
      sizeRows,
      inputTotal: groupInputTotal,
      passedTotal: groupHasPassed ? groupPassedSum : null,
      rejectTotal: groupHasReject ? groupRejectSum : null,
      enteredSizesCount: groupCompletedCount,
      totalSizesCount: sortedSizes.length,
      allSizesComplete,
      statusText: groupStatusText,
    });
  });

  // Sort groups alphabetically by itemName, styleName, color
  groupSections.sort((a, b) => {
    const itemCmp = a.itemName.localeCompare(b.itemName);
    if (itemCmp !== 0) return itemCmp;
    const styleCmp = (a.styleName || "").localeCompare(b.styleName || "");
    if (styleCmp !== 0) return styleCmp;
    return (a.color || "").localeCompare(b.color || "");
  });

  const missingSizesCount = Math.max(0, totalRequiredSizesCount - totalCompletedSizesCount);
  const allSizesComplete = missingSizesCount === 0 && totalRequiredSizesCount > 0;

  let canComplete = false;
  let completionErrorMessage: string | undefined = undefined;

  if (groupSections.length === 0) {
    canComplete = false;
    completionErrorMessage = "No pieces are available for checking.";
  } else {
    // Check if any row has passedQty > inputQty or passedQty < 0
    const hasAnyOverAllocated = groupSections.some((g) =>
      g.sizeRows.some((r) => r.passedQuantity !== null && r.passedQuantity > r.inputQuantity)
    );
    if (hasAnyOverAllocated) {
      canComplete = false;
      completionErrorMessage = "Passed quantity cannot be greater than input quantity.";
    } else if (!allSizesComplete) {
      canComplete = false;
      completionErrorMessage =
        "Enter passed quantity for all required sizes before completing Checking.";
    } else {
      canComplete = true;
    }
  }

  return {
    finalDynamicStageKey,
    finalDynamicStageDisplayName,
    groups: groupSections,
    totalInputPieces,
    totalPassedPieces,
    totalRejectPieces,
    totalRequiredSizesCount,
    totalCompletedSizesCount,
    missingSizesCount,
    allSizesComplete,
    canComplete,
    completionErrorMessage,
  };
}

/**
 * Derives operational Ironing & Packing items from Checking.
 * Only passed pieces (passed_quantity > 0) continue to Ironing & Packing.
 */
export function getIroningPackingInputItems({
  checkingItems,
}: {
  checkingItems: StoredCheckingItem[];
}): {
  items: {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    size: string;
    inputQuantity: number;
  }[];
  totalQuantity: number;
} {
  const items = (checkingItems || [])
    .filter((ci) => (ci.passed_quantity || 0) > 0)
    .map((ci) => ({
      itemName: ci.item_name,
      styleId: ci.style_id || null,
      styleName: ci.style_name || null,
      color: ci.color || null,
      size: ci.size,
      inputQuantity: ci.passed_quantity || 0,
    }));

  const totalQuantity = items.reduce((sum, it) => sum + it.inputQuantity, 0);
  return { items, totalQuantity };
}
