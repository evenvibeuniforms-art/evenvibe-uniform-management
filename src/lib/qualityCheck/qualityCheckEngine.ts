/**
 * qualityCheckEngine.ts
 *
 * Core calculation and validation engine for Admin Quality Check Workspace.
 *
 * WORKFLOW:
 * Stage 8 Packing Completed -> Authoritative Packed Output -> Quality Check Input
 * -> Admin Enters Passed Quantity -> Defective Quantity Auto-Calculated
 * -> QC Completed -> Ready for Packing & Delivery.
 *
 * RULES:
 * 1. Operational QC input comes ONLY from the current order's final Packed Output (actual_quantity > 0).
 * 2. Zero-output rule: Rows with packed_quantity = 0 are strictly excluded from operational QC inspection.
 * 3. Passed Quantity is the ONLY numeric quantity input typed by Admin.
 * 4. Defective Quantity is strictly automatic: Defective = Packed - Passed.
 * 5. Checked Quantity = Passed + Defective (for entered rows).
 * 6. Pending Quantity = Packed - Checked.
 * 7. 0 is strictly a valid entered quantity. Blank/null/undefined means Not Entered (Pending).
 * 8. Validation: 0 <= Passed <= Packed. Never allow Passed > Packed or Passed < 0.
 * 9. Order, Item, Style, Color, Size remain strictly isolated.
 */

export interface StoredPackingOutputItem {
  id?: string;
  order_id: string;
  stage_key?: "ironing" | "packing";
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  input_quantity?: number;
  actual_quantity: number; // Authoritative Packed Quantity
  pending_quantity?: number;
  remarks?: string | null;
  status?: string;
}

export interface StoredQCItem {
  id?: string;
  order_id: string;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  packed_quantity: number;
  passed_quantity: number | null;
  defective_quantity: number;
  remarks?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export type QCRowStatus = "pending" | "passed" | "defective" | "partial" | "invalid";

export interface QCSizeRow {
  rowKey: string;
  size: string;
  packedQuantity: number;
  passedQuantity: number | null; // null = pending / not entered
  defectiveQuantity: number;
  remarks: string;
  status: QCRowStatus;
  statusLabel: string;
  isValid: boolean;
  isComplete: boolean;
  errorMessage?: string;
}

export interface QCGroupSection {
  groupKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  displayName: string;
  totalPacked: number;
  totalChecked: number;
  totalPassed: number;
  totalDefective: number;
  totalPending: number;
  isGroupComplete: boolean;
  sizeRows: QCSizeRow[];
}

export interface QCCalculationResult {
  hasOperationalPieces: boolean;
  groups: QCGroupSection[];
  totalPackedPieces: number;
  totalCheckedPieces: number;
  totalPassedPieces: number;
  totalDefectivePieces: number;
  totalPendingPieces: number;
  allSizesComplete: boolean;
  canComplete: boolean;
  totalRequiredSizesCount: number;
  totalCompletedSizesCount: number;
  progressPercent: number;
  emptyStateMessage?: string;
}

export function buildQCGroupKey(
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

export function buildQCSizeRowKey(groupKey: string, size: string): string {
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
 * Calculates Quality Check state from authoritative packed items,
 * saved QC items, and live admin inputs.
 */
export function calculateQualityCheck({
  savedPackingItems = [],
  savedQCItems = [],
  liveInputs = {},
}: {
  savedPackingItems: StoredPackingOutputItem[];
  savedQCItems?: StoredQCItem[];
  liveInputs?: {
    passedInputs?: Record<string, string>; // rowKey -> value string
    remarksInputs?: Record<string, string>;
  };
}): QCCalculationResult {
  // 1. Filter packing items: strictly actual_quantity > 0
  const operationalPacking = (savedPackingItems || []).filter(
    (pi) => (pi.actual_quantity || 0) > 0
  );

  if (operationalPacking.length === 0) {
    return {
      hasOperationalPieces: false,
      groups: [],
      totalPackedPieces: 0,
      totalCheckedPieces: 0,
      totalPassedPieces: 0,
      totalDefectivePieces: 0,
      totalPendingPieces: 0,
      allSizesComplete: false,
      canComplete: false,
      totalRequiredSizesCount: 0,
      totalCompletedSizesCount: 0,
      progressPercent: 0,
      emptyStateMessage: "No pieces are available for Quality Check.",
    };
  }

  // 2. Build saved values maps
  const savedPassedMap = new Map<string, number>();
  const savedRemarksMap = new Map<string, string>();

  savedQCItems.forEach((qi) => {
    const gKey = buildQCGroupKey(
      qi.item_name,
      qi.style_id || null,
      qi.style_name || null,
      qi.color || null
    );
    const rKey = buildQCSizeRowKey(gKey, qi.size);

    if (qi.passed_quantity !== null && qi.passed_quantity !== undefined) {
      const num = Number(qi.passed_quantity);
      if (!isNaN(num) && num >= 0) {
        savedPassedMap.set(rKey, Math.floor(num));
      }
    }

    if (qi.remarks && qi.remarks.trim()) {
      savedRemarksMap.set(rKey, qi.remarks.trim());
    }
  });

  // Apply live inputs over saved
  const livePassed = liveInputs.passedInputs || {};
  const liveRemarks = liveInputs.remarksInputs || {};

  // 3. Group packing rows
  interface GroupAcc {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, number>; // size -> packed quantity
  }
  const groupMap = new Map<string, GroupAcc>();

  operationalPacking.forEach((pi) => {
    const groupKey = buildQCGroupKey(
      pi.item_name,
      pi.style_id || null,
      pi.style_name || null,
      pi.color || null
    );

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        itemName: pi.item_name.trim(),
        styleId: pi.style_id ? pi.style_id.trim() : null,
        styleName: pi.style_name ? pi.style_name.trim() : null,
        color: pi.color ? pi.color.trim() : null,
        sizes: new Map<string, number>(),
      });
    }

    const grp = groupMap.get(groupKey)!;
    const cleanSize = pi.size.trim();
    const existing = grp.sizes.get(cleanSize) || 0;
    grp.sizes.set(cleanSize, existing + Math.max(0, pi.actual_quantity || 0));
  });

  // 4. Process groups and size rows
  let totalPackedPieces = 0;
  let totalCheckedPieces = 0;
  let totalPassedPieces = 0;
  let totalDefectivePieces = 0;
  let totalRequiredSizesCount = 0;
  let totalCompletedSizesCount = 0;

  const groupSections: QCGroupSection[] = [];

  groupMap.forEach((grp, groupKey) => {
    let groupPackedTotal = 0;
    let groupCheckedSum = 0;
    let groupPassedSum = 0;
    let groupDefectiveSum = 0;
    let groupCompletedCount = 0;

    const styleDisplay = grp.styleName || (grp.styleId ? "Custom Style" : "");
    const colorDisplay = grp.color || "";
    let displayName = grp.itemName;
    if (styleDisplay && colorDisplay) {
      displayName = `${grp.itemName} (${styleDisplay} • ${colorDisplay})`;
    } else if (styleDisplay) {
      displayName = `${grp.itemName} (${styleDisplay})`;
    } else if (colorDisplay) {
      displayName = `${grp.itemName} (${colorDisplay})`;
    }

    const sortedSizeList = sortSizes(Array.from(grp.sizes.keys()));

    const sizeRows: QCSizeRow[] = sortedSizeList.map((size) => {
      totalRequiredSizesCount++;
      const packedQty = grp.sizes.get(size) || 0;
      groupPackedTotal += packedQty;
      totalPackedPieces += packedQty;

      const rowKey = buildQCSizeRowKey(groupKey, size);

      // Determine raw passed input
      const rawPassedVal = livePassed[rowKey] !== undefined
        ? livePassed[rowKey]
        : savedPassedMap.has(rowKey)
          ? String(savedPassedMap.get(rowKey))
          : undefined;

      const remarks = liveRemarks[rowKey] !== undefined
        ? liveRemarks[rowKey]
        : savedRemarksMap.get(rowKey) || "";

      // Evaluation
      let passedQty: number | null = null;
      let defectiveQty = 0;
      let status: QCRowStatus = "pending";
      let statusLabel = "Pending";
      let isValid = true;
      let isComplete = false;
      let errorMessage: string | undefined = undefined;

      if (rawPassedVal === undefined || rawPassedVal === null || String(rawPassedVal).trim() === "") {
        // Pending: Not entered
        passedQty = null;
        defectiveQty = 0;
        status = "pending";
        statusLabel = "Pending";
        isValid = true;
        isComplete = false;
      } else {
        const trimmed = String(rawPassedVal).trim();
        const parsed = Number(trimmed);

        if (isNaN(parsed) || !/^-?\d+$/.test(trimmed)) {
          passedQty = null;
          defectiveQty = 0;
          status = "invalid";
          statusLabel = "Invalid";
          isValid = false;
          isComplete = false;
          errorMessage = "Please enter a valid whole number >= 0";
        } else if (parsed < 0) {
          passedQty = parsed;
          defectiveQty = 0;
          status = "invalid";
          statusLabel = "Invalid";
          isValid = false;
          isComplete = false;
          errorMessage = "Passed Quantity cannot be negative.";
        } else if (parsed > packedQty) {
          passedQty = parsed;
          defectiveQty = 0;
          status = "invalid";
          statusLabel = "Invalid";
          isValid = false;
          isComplete = false;
          errorMessage = "Passed Quantity cannot be greater than Packed Quantity.";
        } else {
          // Valid entered quantity (0 is strictly valid)
          passedQty = parsed;
          defectiveQty = packedQty - parsed;
          isValid = true;
          isComplete = true;
          totalCompletedSizesCount++;
          groupCompletedCount++;

          // Running sums (Checked = Passed + Defective = Packed)
          groupCheckedSum += packedQty;
          groupPassedSum += parsed;
          groupDefectiveSum += defectiveQty;

          totalCheckedPieces += packedQty;
          totalPassedPieces += parsed;
          totalDefectivePieces += defectiveQty;

          if (parsed === packedQty) {
            status = "passed";
            statusLabel = "Passed";
          } else if (parsed === 0) {
            status = "defective";
            statusLabel = "Defective";
          } else {
            status = "partial";
            statusLabel = "Partial";
          }
        }
      }

      return {
        rowKey,
        size,
        packedQuantity: packedQty,
        passedQuantity: passedQty,
        defectiveQuantity: defectiveQty,
        remarks,
        status,
        statusLabel,
        isValid,
        isComplete,
        errorMessage,
      };
    });

    const groupPending = groupPackedTotal - groupCheckedSum;

    groupSections.push({
      groupKey,
      itemName: grp.itemName,
      styleId: grp.styleId,
      styleName: grp.styleName,
      color: grp.color,
      displayName,
      totalPacked: groupPackedTotal,
      totalChecked: groupCheckedSum,
      totalPassed: groupPassedSum,
      totalDefective: groupDefectiveSum,
      totalPending: Math.max(0, groupPending),
      isGroupComplete: groupCompletedCount === sizeRows.length && sizeRows.length > 0,
      sizeRows,
    });
  });

  const totalPendingPieces = Math.max(0, totalPackedPieces - totalCheckedPieces);
  const allSizesComplete =
    totalRequiredSizesCount > 0 &&
    totalCompletedSizesCount === totalRequiredSizesCount &&
    totalPendingPieces === 0;

  const progressPercent = totalPackedPieces > 0
    ? Math.min(100, Math.round((totalCheckedPieces / totalPackedPieces) * 100))
    : 0;

  return {
    hasOperationalPieces: true,
    groups: groupSections,
    totalPackedPieces,
    totalCheckedPieces,
    totalPassedPieces,
    totalDefectivePieces,
    totalPendingPieces,
    allSizesComplete,
    canComplete: allSizesComplete,
    totalRequiredSizesCount,
    totalCompletedSizesCount,
    progressPercent,
  };
}
