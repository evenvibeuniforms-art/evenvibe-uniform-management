import { sortSizes } from "@/lib/constants/studentSizes";

export interface ReqItemSnapshot {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name?: string | null;
  gender?: string | null;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  quantity: number;
}

export interface StoredCuttingItem {
  id?: string;
  order_id: string;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  required_quantity: number;
  cut_quantity: number;
  result_quantity?: number;
}

export interface ClassBreakdownItem {
  className: string;
  sectionName?: string | null;
  quantity: number;
}

export type CuttingStatusType = "complete" | "pending" | "extra_cut" | "not_entered";

export interface CuttingSizeRow {
  size: string;
  required: number;
  cut: number | null;
  result: number | null;
  resultDisplay: string;
  statusText: string;
  statusType: CuttingStatusType;
  classBreakdown: ClassBreakdownItem[];
  rowKey: string;
}

export interface CuttingGroupSection {
  groupKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  cleanStyleName: string;
  displayColor: string;
  displayName: string;
  sizeRows: CuttingSizeRow[];
  requiredTotal: number;
  cutTotal: number;
  pendingTotal: number;
  extraCutTotal: number;
  allSizesEntered: boolean;
}

import { STANDARD_CLASSES } from "@/lib/constants/classes";

export interface OrderStudentUniformItem {
  itemName: string;
  styleName: string;
  color: string;
  size: string;
  quantity: number;
}

export interface OrderStudentDetail {
  id: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  section: string;
  gender: string;
  uniforms: OrderStudentUniformItem[];
}

export interface ClassStudentSummary {
  className: string;
  studentCount: number;
  students: OrderStudentDetail[];
}

export function compareClasses(a: string, b: string): number {
  const indexA = STANDARD_CLASSES.indexOf(a);
  const indexB = STANDARD_CLASSES.indexOf(b);

  if (indexA !== -1 && indexB !== -1) {
    return indexA - indexB;
  }
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function groupOrderStudentsByClass(
  students: OrderStudentDetail[] = []
): ClassStudentSummary[] {
  const map = new Map<string, OrderStudentDetail[]>();
  students.forEach((s) => {
    const cls = s.className || "Unassigned";
    if (!map.has(cls)) {
      map.set(cls, []);
    }
    map.get(cls)!.push(s);
  });

  const result: ClassStudentSummary[] = Array.from(map.entries()).map(
    ([className, classStudents]) => ({
      className,
      studentCount: classStudents.length,
      students: classStudents.sort((a, b) => a.studentName.localeCompare(b.studentName)),
    })
  );

  return result.sort((a, b) => compareClasses(a.className, b.className));
}

export interface CuttingCalculationResult {
  groups: CuttingGroupSection[];
  totalRequiredPieces: number;
  totalCutPieces: number;
  totalPendingPieces: number;
  totalExtraCutPieces: number;
  totalStudents: number;
  classSummaries: ClassStudentSummary[];
  allRowsEntered: boolean;
  missingSizesCount: number;
  totalGroupsCount: number;
}

/**
 * Normalizes an item or style text for deterministic key mapping.
 */
function normalizeText(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : fallback;
}

/**
 * Builds a deterministic key for a style + color section.
 */
export function buildCuttingGroupKey(
  itemName: string,
  styleId: string | null | undefined,
  styleName: string | null | undefined,
  color: string | null | undefined
): string {
  const normItem = normalizeText(itemName, "unknown_item");
  const normStyleId = normalizeText(styleId, "no_style_id");
  const normStyleName = normalizeText(styleName, "no_style_name");
  const normColor = normalizeText(color, "no_color");
  return `${normItem}__${normStyleId}__${normStyleName}__${normColor}`;
}

/**
 * Builds a deterministic row key for a specific size within a group.
 */
export function buildCuttingSizeRowKey(groupKey: string, size: string): string {
  const normSize = normalizeText(size, "unknown_size");
  return `${groupKey}__${normSize}`;
}

/**
 * Authoritative Cutting stage calculation engine.
 *
 * Rules:
 * 1. Required Quantity comes strictly from current order's Stock Sizes / requirement_items.
 * 2. Every unique Item + Style + Color combination must be shown separately. Never combine colors.
 * 3. RESULT = ACTUAL CUT QUANTITY - REQUIRED QUANTITY.
 * 4. Result = 0: "Complete"
 * 5. Result > 0: "Extra Cut" (e.g. "+2", "2 Extra Cut")
 * 6. Result < 0: "Pending" (e.g. "-2", "2 Pending")
 * 7. Pending and Extra Cut are calculated independently from size-level results.
 * 8. Natural size ordering (numeric first).
 * 9. Preserves class-level breakdown for every size.
 */
export function calculateCuttingRequirements(
  requirementItems: ReqItemSnapshot[],
  savedCuttingItems: StoredCuttingItem[] = [],
  liveInputs?: Record<string, string>,
  orderStudents?: OrderStudentDetail[],
  fallbackTotalStudents: number = 0
): CuttingCalculationResult {
  // 1. Build lookup for cut quantities
  // Precedence: liveInputs (if provided) > savedCuttingItems
  const cutLookup = new Map<string, number>();

  (savedCuttingItems || []).forEach((item) => {
    const groupKey = buildCuttingGroupKey(item.item_name, item.style_id, item.style_name, item.color);
    const rowKey = buildCuttingSizeRowKey(groupKey, item.size);
    if (typeof item.cut_quantity === "number" && !isNaN(item.cut_quantity) && item.cut_quantity >= 0) {
      cutLookup.set(rowKey, item.cut_quantity);
    }
  });

  if (liveInputs) {
    Object.entries(liveInputs).forEach(([rowKey, val]) => {
      const trimmed = val.trim();
      if (trimmed !== "" && /^\d+$/.test(trimmed)) {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 0) {
          cutLookup.set(rowKey, num);
        }
      } else if (trimmed === "") {
        cutLookup.delete(rowKey);
      }
    });
  }

  // 2. Aggregate requirement items by Group (Item + Style + Color) and Size
  interface InternalSizeData {
    required: number;
    classes: Map<string, { className: string; sectionName?: string | null; quantity: number }>;
  }

  interface InternalGroupData {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, InternalSizeData>;
  }

  const groupMap = new Map<string, InternalGroupData>();

  (requirementItems || []).forEach((item) => {
    const rawItem = (item.item_name || "Uniform Item").trim();
    const rawStyleId = item.style_id ? item.style_id.trim() : null;
    const rawStyleName = item.style_name ? item.style_name.trim() : null;
    const rawColor = item.color ? item.color.trim() : null;
    const rawSize = (item.size || "Standard").trim();
    const qty = Number(item.quantity) || 0;

    const groupKey = buildCuttingGroupKey(rawItem, rawStyleId, rawStyleName, rawColor);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        itemName: rawItem,
        styleId: rawStyleId,
        styleName: rawStyleName,
        color: rawColor,
        sizes: new Map(),
      });
    }

    const grp = groupMap.get(groupKey)!;
    if (!grp.sizes.has(rawSize)) {
      grp.sizes.set(rawSize, {
        required: 0,
        classes: new Map(),
      });
    }

    const sizeData = grp.sizes.get(rawSize)!;
    sizeData.required += qty;

    // Class-level breakdown
    const classKey = `${item.class_name || "Unassigned"}__${item.section_name || ""}`;
    if (!sizeData.classes.has(classKey)) {
      sizeData.classes.set(classKey, {
        className: item.class_name || "Unassigned",
        sectionName: item.section_name || null,
        quantity: 0,
      });
    }
    sizeData.classes.get(classKey)!.quantity += qty;
  });

  // 3. Transform groups and compute size-level results
  const groups: CuttingGroupSection[] = [];
  let totalRequiredPieces = 0;
  let totalCutPieces = 0;
  let totalPendingPieces = 0;
  let totalExtraCutPieces = 0;
  let missingSizesCount = 0;

  groupMap.forEach((grp, groupKey) => {
    // Natural size sorting
    const sortedSizeKeys = sortSizes(Array.from(grp.sizes.keys()));

    const sizeRows: CuttingSizeRow[] = [];
    let groupRequiredTotal = 0;
    let groupCutTotal = 0;
    let groupPendingTotal = 0;
    let groupExtraCutTotal = 0;
    let groupAllSizesEntered = true;

    sortedSizeKeys.forEach((sizeKey) => {
      const sizeData = grp.sizes.get(sizeKey)!;
      const rowKey = buildCuttingSizeRowKey(groupKey, sizeKey);
      const required = sizeData.required;

      const hasCutValue = cutLookup.has(rowKey);
      const cut = hasCutValue ? cutLookup.get(rowKey)! : null;

      let result: number | null = null;
      let resultDisplay = "—";
      let statusText = "Pending Entry";
      let statusType: CuttingStatusType = "not_entered";

      if (cut !== null) {
        // FORMULA: RESULT = ACTUAL CUT QUANTITY - REQUIRED QUANTITY
        result = cut - required;

        if (result === 0) {
          resultDisplay = "0";
          statusText = "Complete";
          statusType = "complete";
        } else if (result > 0) {
          // result > 0: More cut than required -> Extra Cut (+N)
          resultDisplay = `+${result}`;
          statusText = `${result} Extra Cut`;
          statusType = "extra_cut";
          groupExtraCutTotal += result;
          totalExtraCutPieces += result;
        } else {
          // result < 0: Less cut than required -> Pending (-N)
          resultDisplay = `${result}`;
          statusText = `${Math.abs(result)} Pending`;
          statusType = "pending";
          const pending = Math.abs(result);
          groupPendingTotal += pending;
          totalPendingPieces += pending;
        }

        groupCutTotal += cut;
        totalCutPieces += cut;
      } else {
        groupAllSizesEntered = false;
        missingSizesCount += 1;
        // When not yet cut, the entire required is pending
        groupPendingTotal += required;
        totalPendingPieces += required;
      }

      groupRequiredTotal += required;
      totalRequiredPieces += required;

      // Class breakdown sorted by class name
      const classBreakdown: ClassBreakdownItem[] = Array.from(sizeData.classes.values()).sort((a, b) =>
        a.className.localeCompare(b.className)
      );

      sizeRows.push({
        size: sizeKey,
        required,
        cut,
        result,
        resultDisplay,
        statusText,
        statusType,
        classBreakdown,
        rowKey,
      });
    });

    // Formatting titles
    const cleanStyleName = grp.styleName || "Standard";
    const displayColor = grp.color || "—";
    const displayName = `${grp.itemName.toUpperCase()} — ${cleanStyleName.toUpperCase()}`;

    groups.push({
      groupKey,
      itemName: grp.itemName,
      styleId: grp.styleId,
      styleName: grp.styleName,
      color: grp.color,
      cleanStyleName,
      displayColor,
      displayName,
      sizeRows,
      requiredTotal: groupRequiredTotal,
      cutTotal: groupCutTotal,
      pendingTotal: groupPendingTotal,
      extraCutTotal: groupExtraCutTotal,
      allSizesEntered: groupAllSizesEntered,
    });
  });

  // Sort groups by Item Name, then Style Name, then Color
  groups.sort((a, b) => {
    const itemCmp = a.itemName.localeCompare(b.itemName);
    if (itemCmp !== 0) return itemCmp;
    const styleCmp = a.cleanStyleName.localeCompare(b.cleanStyleName);
    if (styleCmp !== 0) return styleCmp;
    return a.displayColor.localeCompare(b.displayColor);
  });

  const allRowsEntered = missingSizesCount === 0 && totalRequiredPieces > 0;
  const classSummaries = groupOrderStudentsByClass(orderStudents || []);
  const totalStudents =
    orderStudents && orderStudents.length > 0 ? orderStudents.length : fallbackTotalStudents;

  return {
    groups,
    totalRequiredPieces,
    totalCutPieces,
    totalPendingPieces,
    totalExtraCutPieces,
    totalStudents,
    classSummaries,
    allRowsEntered,
    missingSizesCount,
    totalGroupsCount: groups.length,
  };
}
