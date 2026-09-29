import { OrderWorkflowStage, formatWorkflowStageLabel } from "@/lib/productionWorkflow";
import { StoredCuttingItem } from "@/lib/production/cuttingCalculations";
import { sortSizes } from "@/lib/constants/studentSizes";

export interface StoredStageItem {
  id?: string;
  order_id: string;
  stage_key: string;
  sequence_order: number;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  input_quantity: number;
  actual_quantity: number; // Represents Actual Mistaked Quantity
  result_quantity?: number; // Represents Output = input_quantity - actual_quantity
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export type DynamicStageStatusType = "complete" | "mistaked" | "not_entered";

export interface DynamicStageSizeRow {
  size: string;
  inputQuantity: number;
  mistakedQuantity: number | null;
  outputQuantity: number | null;
  result: number | null; // Output quantity (input - mistaked)
  resultDisplay: string;
  statusText: string;
  statusType: DynamicStageStatusType;
  rowKey: string;
}

export interface DynamicStageGroupSection {
  groupKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  cleanStyleName: string;
  displayColor: string;
  displayName: string;
  sizeRows: DynamicStageSizeRow[];
  inputTotal: number;
  mistakedTotal: number | null;
  outputTotal: number | null;
  enteredSizesCount: number;
  totalSizesCount: number;
  allSizesEntered: boolean;
}

export interface DynamicStageCalculationResult {
  stageKey: string;
  stageDisplayName: string;
  stageSequence: number;
  previousStageKey: string;
  previousStageDisplayName: string;
  nextStageKey: string | null;
  nextStageDisplayName: string | null;
  groups: DynamicStageGroupSection[];
  totalInputPieces: number;
  totalMistakedPieces: number | null;
  totalOutputPieces: number | null;
  totalRequiredSizesCount: number;
  totalEnteredSizesCount: number;
  allRequiredSizesEntered: boolean;
  missingSizesCount: number;
}

export interface StageInputItem {
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  color: string | null;
  size: string;
  inputQuantity: number;
}

/**
 * Returns formatted display name for a stage key.
 */
export function getStageDisplayName(stageKey: string): string {
  if (stageKey === "stitching") return "Stitching";
  if (stageKey === "printing") return "Printing";
  if (stageKey === "embroidering") return "Embroidering";
  if (stageKey === "cutting") return "Cutting";
  if (stageKey === "checking") return "Checking";
  if (stageKey === "ironing_packing") return "Ironing & Packing";
  if (stageKey === "inventory") return "Inventory";
  if (stageKey === "stock_sizes") return "Stock Sizes";
  return formatWorkflowStageLabel(stageKey);
}

/**
 * Section 2 Label:
 * "Admin enters actual mistaked [CURRENT STAGE] quantity"
 * Dynamic based on current stage name.
 */
export function getAdminMistakedLabel(stageDisplayName: string): string {
  return `Admin enters actual mistaked ${stageDisplayName} quantity`;
}

/**
 * Section 1 Label:
 * "INPUT FROM [PREVIOUS STAGE]"
 * Dynamic based on previous stage name.
 */
export function getInputFromLabel(previousStageDisplayName: string): string {
  return `INPUT FROM ${previousStageDisplayName.toUpperCase()}`;
}

/**
 * Section 3 Label:
 * "RESULT / OUTPUT"
 */
export function getResultLabel(): string {
  return "RESULT / OUTPUT";
}

/**
 * Build unique group key preserving Item + Style + Color separation.
 */
export function buildDynamicGroupKey(
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
 * Build unique row key for size within group.
 */
export function buildDynamicSizeRowKey(groupKey: string, size: string): string {
  return `${groupKey}::${(size || "Standard").trim().toLowerCase()}`;
}

/**
 * Result / Output calculation for dynamic middle stages:
 * Result / Output = Input Quantity - Actual Mistaked Quantity
 */
export function calculateStageResult(
  inputQuantity: number,
  actualMistakedQuantity: number
): number {
  return Math.max(0, inputQuantity - actualMistakedQuantity);
}

/**
 * Stage Output calculation:
 * Output = Input Quantity - Actual Mistaked Quantity
 */
export function getStageOutput(
  inputQuantity: number,
  actualMistakedQuantity: number
): number {
  return Math.max(0, inputQuantity - actualMistakedQuantity);
}

/**
 * Validate stage input against expected previous stage output.
 */
export function validateStageInput(
  clientInput: number,
  expectedInput: number
): boolean {
  return clientInput === expectedInput;
}

export interface GetStageInputParams {
  stageKey: string;
  item: {
    item_name: string;
    style_id?: string | null;
    style_name?: string | null;
    color?: string | null;
    size: string;
  };
  workflows: OrderWorkflowStage[] | null | undefined;
  cuttingItems: StoredCuttingItem[];
  stageItems: StoredStageItem[];
}

export interface DirectStageInputParams {
  previousStageKey: string;
  cutQuantity?: number | null;
  previousStageInput?: number | null;
  previousStageMistaked?: number | null;
}

/**
 * Derives the authoritative stage input for a given stage and row item.
 *
 * CORE BUSINESS RULE:
 * - If current stage is the first dynamic stage (previous stage is Cutting):
 *   authoritative input = Cutting.cut_quantity (Actual Physical Cut Output).
 *   MUST NOT use required_quantity.
 *   MUST NOT use cutting result.
 * - If current stage is a later dynamic stage (previous stage is dynamic stage 4..6):
 *   authoritative input = previous dynamic stage Output (input_quantity - actual_mistaked_quantity).
 */
export function getStageInput(
  params: GetStageInputParams | DirectStageInputParams
): number;
export function getStageInput(
  previousStageKey: string,
  cutQuantityOrPreviousOutput: number
): number;
export function getStageInput(
  arg1: GetStageInputParams | DirectStageInputParams | string,
  arg2?: number
): number {
  if (typeof arg1 === "string") {
    return Math.max(0, arg2 || 0);
  }

  if ("previousStageKey" in arg1) {
    if (arg1.previousStageKey === "cutting") {
      // Authoritative Cutting Cut Quantity (cut_quantity)
      return Math.max(0, arg1.cutQuantity ?? 0);
    }
    // Later dynamic stage Output = input - mistaked
    const prevIn = arg1.previousStageInput ?? 0;
    const prevMistaked = arg1.previousStageMistaked ?? 0;
    return Math.max(0, prevIn - prevMistaked);
  }

  const { stageKey, item, workflows, cuttingItems, stageItems } = arg1;
  const previousStage = getPreviousStage(stageKey, workflows);
  if (!previousStage) return 0;

  const normItem = (item.item_name || "").trim().toLowerCase();
  const normStyleId = item.style_id ? item.style_id.trim() : null;
  const normStyleName = item.style_name ? item.style_name.trim().toLowerCase() : null;
  const normColor = item.color ? item.color.trim().toLowerCase() : null;
  const normSize = (item.size || "").trim().toLowerCase();

  if (previousStage.stage_key === "cutting") {
    const match = (cuttingItems || []).find((ci) => {
      const ciItem = (ci.item_name || "").trim().toLowerCase();
      const ciStyleId = ci.style_id ? ci.style_id.trim() : null;
      const ciStyleName = ci.style_name ? ci.style_name.trim().toLowerCase() : null;
      const ciColor = ci.color ? ci.color.trim().toLowerCase() : null;
      const ciSize = (ci.size || "").trim().toLowerCase();

      return (
        ciItem === normItem &&
        ciStyleId === normStyleId &&
        ciStyleName === normStyleName &&
        ciColor === normColor &&
        ciSize === normSize
      );
    });

    if (match && match.cut_quantity !== null && match.cut_quantity !== undefined) {
      const parsed = Number(match.cut_quantity);
      return !isNaN(parsed) && parsed > 0 ? Math.max(0, parsed) : 0;
    }
    return 0;
  }

  const prevItems = (stageItems || []).filter((si) => si.stage_key === previousStage.stage_key);
  const match = prevItems.find((si) => {
    const siItem = (si.item_name || "").trim().toLowerCase();
    const siStyleId = ciStyleIdSafe(si.style_id);
    const itStyleId = ciStyleIdSafe(item.style_id);
    const siStyleName = (si.style_name || "").trim().toLowerCase();
    const itStyleName = (item.style_name || "").trim().toLowerCase();
    const siColor = (si.color || "").trim().toLowerCase();
    const itColor = (item.color || "").trim().toLowerCase();
    const siSize = (si.size || "").trim().toLowerCase();

    return (
      siItem === normItem &&
      siStyleId === itStyleId &&
      siStyleName === itStyleName &&
      siColor === itColor &&
      siSize === normSize
    );
  });

  if (match) {
    if (typeof match.result_quantity === "number" && !isNaN(match.result_quantity)) {
      return Number(match.result_quantity) > 0 ? match.result_quantity : 0;
    }
    if (typeof match.input_quantity === "number" && typeof match.actual_quantity === "number") {
      const diff = match.input_quantity - match.actual_quantity;
      return Number(diff) > 0 ? diff : 0;
    }
  }

  return 0;
}

function ciStyleIdSafe(id?: string | null): string {
  return id ? id.trim() : "none";
}

/**
 * Sorts workflows by sequence_order ASC (1..8).
 */
export function getProductionSequence(
  workflows: OrderWorkflowStage[] | null | undefined
): OrderWorkflowStage[] {
  return [...(workflows || [])].sort((a, b) => a.sequence_order - b.sequence_order);
}

/**
 * Retrieves the stage immediately preceding stageKey in this order's workflow.
 */
export function getPreviousStage(
  stageKey: string,
  workflows: OrderWorkflowStage[] | null | undefined
): OrderWorkflowStage | null {
  const sorted = getProductionSequence(workflows);
  const currentIndex = sorted.findIndex((w) => w.stage_key === stageKey);
  if (currentIndex > 0) {
    return sorted[currentIndex - 1];
  }
  return null;
}

/**
 * Retrieves the currently active stage from workflows.
 */
export function getCurrentStage(
  workflows: OrderWorkflowStage[] | null | undefined,
  legacyStage?: string
): OrderWorkflowStage | null {
  const sorted = getProductionSequence(workflows);
  if (sorted.length === 0) return null;

  const inProgress = sorted.find((w) => w.status === "in_progress");
  if (inProgress) return inProgress;

  if (legacyStage) {
    const matching = sorted.find((w) => w.stage_key === legacyStage);
    if (matching) return matching;
  }

  const pending = sorted.find((w) => w.status === "pending");
  if (pending) return pending;

  return sorted[0];
}

/**
 * Retrieves the stage immediately following stageKey in this order's workflow.
 */
export function getNextStage(
  stageKey: string,
  workflows: OrderWorkflowStage[] | null | undefined
): OrderWorkflowStage | null {
  const sorted = getProductionSequence(workflows);
  const currentIndex = sorted.findIndex((w) => w.stage_key === stageKey);
  if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
    return sorted[currentIndex + 1];
  }
  return null;
}

/**
 * Derives the authoritative input items for a dynamic stage based on the saved workflow.
 * 
 * CORE DATA FLOW:
 * CUTTING OUTPUT (Cut Quantity) -> STAGE #4 INPUT
 * STAGE #4 OUTPUT (Input - Mistaked) -> STAGE #5 INPUT
 * STAGE #5 OUTPUT (Input - Mistaked) -> STAGE #6 INPUT
 * STAGE #6 OUTPUT (Input - Mistaked) -> CHECKING INPUT
 * 
 * HARD RULE:
 * 1. Cutting Output = Cut Quantity (NOT Cutting Result = Cut - Required).
 * 2. ZERO OUTPUT FILTER: Only items with positive physical output (Number(output) > 0)
 *    are propagated as operational input items to the next stage.
 *    Any item with Output = 0 is NOT displayed/created as an operational row.
 */
export function getStageInputItems({
  stageKey,
  workflows,
  cuttingItems,
  stageItems,
}: {
  stageKey: string;
  workflows: OrderWorkflowStage[] | null | undefined;
  cuttingItems: StoredCuttingItem[];
  stageItems: StoredStageItem[];
}): {
  previousStage: OrderWorkflowStage | null;
  currentStage: OrderWorkflowStage | null;
  items: StageInputItem[];
} {
  const sorted = getProductionSequence(workflows);
  const currentStage = sorted.find((w) => w.stage_key === stageKey) || null;
  const previousStage = getPreviousStage(stageKey, workflows);

  if (!previousStage) {
    return { previousStage: null, currentStage, items: [] };
  }

  // If previous stage is Cutting (Stage 3):
  // Output of Cutting is Cut Quantity (ci.cut_quantity), NOT Cutting Result!
  // Filter for positive physical cut output only (Number(cutQty) > 0).
  if (previousStage.stage_key === "cutting") {
    const items: StageInputItem[] = (cuttingItems || [])
      .map((ci) => {
        let cutQty = 0;
        if (typeof ci.cut_quantity === "number" && !isNaN(ci.cut_quantity)) {
          cutQty = Math.max(0, ci.cut_quantity);
        } else if (ci.cut_quantity !== null && ci.cut_quantity !== undefined) {
          const parsed = Number(ci.cut_quantity);
          if (!isNaN(parsed)) cutQty = Math.max(0, parsed);
        }
        return {
          itemName: ci.item_name,
          styleId: ci.style_id || null,
          styleName: ci.style_name || null,
          color: ci.color || null,
          size: ci.size,
          inputQuantity: cutQty,
        };
      })
      .filter((it) => Number(it.inputQuantity) > 0);

    return { previousStage, currentStage, items };
  }

  // If previous stage is any middle stage (4, 5, or 6):
  // Output of that stage is (input_quantity - actual_quantity), i.e. result_quantity!
  // Filter for positive physical output only (Number(outputQty) > 0).
  const prevStageKey = previousStage.stage_key;
  const prevItems = (stageItems || []).filter((si) => si.stage_key === prevStageKey);

  const items: StageInputItem[] = prevItems
    .map((si) => {
      let outputQty = 0;
      if (typeof si.result_quantity === "number" && !isNaN(si.result_quantity)) {
        outputQty = Math.max(0, si.result_quantity);
      } else if (typeof si.input_quantity === "number" && typeof si.actual_quantity === "number") {
        outputQty = Math.max(0, si.input_quantity - si.actual_quantity);
      }

      return {
        itemName: si.item_name,
        styleId: si.style_id || null,
        styleName: si.style_name || null,
        color: si.color || null,
        size: si.size,
        inputQuantity: outputQty,
      };
    })
    .filter((it) => Number(it.inputQuantity) > 0);

  return { previousStage, currentStage, items };
}

/**
 * Derives operational checking items from the final dynamic middle stage.
 * Only positive physical outputs (Number(output) > 0) enter Checking.
 */
export function getCheckingInputItems({
  workflows,
  stageItems,
}: {
  workflows: OrderWorkflowStage[] | null | undefined;
  stageItems: StoredStageItem[];
}): {
  finalDynamicStage: OrderWorkflowStage | null;
  items: StageInputItem[];
  totalQuantity: number;
} {
  const sorted = getProductionSequence(workflows);
  const checkingStage = sorted.find((w) => w.stage_key === "checking");
  const finalDynamicStage = checkingStage
    ? getPreviousStage("checking", workflows)
    : sorted.filter((w) => w.sequence_order >= 4 && w.sequence_order <= 6).pop() || null;

  if (!finalDynamicStage) {
    return { finalDynamicStage: null, items: [], totalQuantity: 0 };
  }

  const prevItems = (stageItems || []).filter((si) => si.stage_key === finalDynamicStage.stage_key);
  const items: StageInputItem[] = prevItems
    .map((si) => {
      let outputQty = 0;
      if (typeof si.result_quantity === "number" && !isNaN(si.result_quantity)) {
        outputQty = Math.max(0, si.result_quantity);
      } else if (typeof si.input_quantity === "number" && typeof si.actual_quantity === "number") {
        outputQty = Math.max(0, si.input_quantity - si.actual_quantity);
      }

      return {
        itemName: si.item_name,
        styleId: si.style_id || null,
        styleName: si.style_name || null,
        color: si.color || null,
        size: si.size,
        inputQuantity: outputQty,
      };
    })
    .filter((it) => Number(it.inputQuantity) > 0);

  const totalQuantity = items.reduce((sum, it) => sum + it.inputQuantity, 0);
  return { finalDynamicStage, items, totalQuantity };
}

/**
 * Calculates full dynamic stage state, groups, rows, results, and summary totals.
 */
export function calculateDynamicStage({
  stageKey,
  workflows,
  cuttingItems,
  stageItems,
  liveInputs,
}: {
  stageKey: string;
  workflows: OrderWorkflowStage[] | null | undefined;
  cuttingItems: StoredCuttingItem[];
  stageItems: StoredStageItem[];
  liveInputs?: Record<string, string>;
}): DynamicStageCalculationResult {
  const sorted = getProductionSequence(workflows);
  const currentStage = sorted.find((w) => w.stage_key === stageKey) || null;
  const previousStage = getPreviousStage(stageKey, workflows);
  const nextStage = getNextStage(stageKey, workflows);

  const stageDisplayName = getStageDisplayName(stageKey);
  const previousStageDisplayName = previousStage
    ? getStageDisplayName(previousStage.stage_key)
    : "Previous Stage";
  const nextStageDisplayName = nextStage
    ? getStageDisplayName(nextStage.stage_key)
    : null;

  const { items: inputItems } = getStageInputItems({
    stageKey,
    workflows,
    cuttingItems,
    stageItems,
  });

  // Current stage's saved items (actual_quantity represents mistaked quantity)
  const savedForCurrentStage = (stageItems || []).filter(
    (si) => si.stage_key === stageKey
  );

  // Build map of saved actual mistaked quantities
  const savedMistakedMap = new Map<string, number>();
  savedForCurrentStage.forEach((si) => {
    const gKey = buildDynamicGroupKey(si.item_name, si.style_id, si.style_name, si.color);
    const rKey = buildDynamicSizeRowKey(gKey, si.size);
    const rawActual = si.actual_quantity;
    const actualNum = typeof rawActual === "number"
      ? rawActual
      : (rawActual !== null && rawActual !== undefined && (rawActual as unknown) !== "")
        ? Number(rawActual)
        : null;
    if (actualNum !== null && !isNaN(actualNum) && actualNum >= 0) {
      savedMistakedMap.set(rKey, actualNum);
    }
  });

  // Apply live inputs over saved (distinguishing empty input string vs explicit '0')
  const mistakedLookup = new Map<string, number>(savedMistakedMap);
  if (liveInputs) {
    Object.entries(liveInputs).forEach(([rKey, val]) => {
      if (val !== undefined && val !== null) {
        const trimmed = val.trim();
        if (trimmed !== "" && /^\d+$/.test(trimmed)) {
          const num = parseInt(trimmed, 10);
          if (!isNaN(num) && num >= 0) {
            mistakedLookup.set(rKey, num);
          }
        } else if (trimmed === "") {
          mistakedLookup.delete(rKey);
        }
      }
    });
  }

  // Aggregate by Group (Item + Style + Color)
  interface GroupAcc {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    sizes: Map<string, number>; // size -> inputQuantity
  }

  const groupAccMap = new Map<string, GroupAcc>();

  inputItems.forEach((it) => {
    const rawItem = (it.itemName || "Uniform Item").trim();
    const rawStyleId = it.styleId ? it.styleId.trim() : null;
    const rawStyleName = it.styleName ? it.styleName.trim() : null;
    const rawColor = it.color ? it.color.trim() : null;
    const rawSize = (it.size || "Standard").trim();
    const gKey = buildDynamicGroupKey(rawItem, rawStyleId, rawStyleName, rawColor);

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

  // Build group sections
  const groupSections: DynamicStageGroupSection[] = [];
  let totalInputPieces = 0;
  let totalEnteredMistakedPieces = 0;
  let totalEnteredOutputPieces = 0;
  let totalRequiredSizesCount = 0;
  let totalEnteredSizesCount = 0;

  Array.from(groupAccMap.entries()).forEach(([groupKey, grp]) => {
    const cleanStyleName = grp.styleName || "Standard Style";
    const displayColor = grp.color || "Standard Color";
    const displayName = `${grp.itemName} — ${cleanStyleName} (${displayColor})`;

    const sortedSizes = sortSizes(Array.from(grp.sizes.keys()));

    let groupInputTotal = 0;
    let groupMistakedSum = 0;
    let groupOutputSum = 0;
    let groupEnteredCount = 0;

    const sizeRows: DynamicStageSizeRow[] = sortedSizes.map((size) => {
      totalRequiredSizesCount += 1;
      const inputQty = grp.sizes.get(size) || 0;
      const rowKey = buildDynamicSizeRowKey(groupKey, size);
      const hasMistaked = mistakedLookup.has(rowKey);
      const mistakedQty = hasMistaked ? (mistakedLookup.get(rowKey) as number) : null;

      groupInputTotal += inputQty;

      if (mistakedQty !== null) {
        groupEnteredCount += 1;
        totalEnteredSizesCount += 1;
        groupMistakedSum += mistakedQty;
        totalEnteredMistakedPieces += mistakedQty;

        // Formula: Result / Output = inputQuantity - actualMistakedQuantity
        const outputQty = Math.max(0, inputQty - mistakedQty);
        groupOutputSum += outputQty;
        totalEnteredOutputPieces += outputQty;

        const statusType: DynamicStageStatusType = mistakedQty > 0 ? "mistaked" : "complete";
        const statusText = "Complete";

        return {
          size,
          inputQuantity: inputQty,
          mistakedQuantity: mistakedQty,
          outputQuantity: outputQty,
          result: outputQty,
          resultDisplay: String(outputQty),
          statusText,
          statusType,
          rowKey,
        };
      } else {
        return {
          size,
          inputQuantity: inputQty,
          mistakedQuantity: null,
          outputQuantity: null,
          result: null,
          resultDisplay: "—",
          statusText: "Enter Quantity",
          statusType: "not_entered",
          rowKey,
        };
      }
    });

    totalInputPieces += groupInputTotal;

    const allSizesEntered = groupEnteredCount === sortedSizes.length && sortedSizes.length > 0;

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
      mistakedTotal: groupEnteredCount > 0 ? groupMistakedSum : null,
      outputTotal: groupEnteredCount > 0 ? groupOutputSum : null,
      enteredSizesCount: groupEnteredCount,
      totalSizesCount: sortedSizes.length,
      allSizesEntered,
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

  const missingSizesCount = Math.max(0, totalRequiredSizesCount - totalEnteredSizesCount);
  const allRequiredSizesEntered = missingSizesCount === 0 && totalRequiredSizesCount > 0;

  return {
    stageKey,
    stageDisplayName,
    stageSequence: currentStage?.sequence_order || 4,
    previousStageKey: previousStage?.stage_key || "cutting",
    previousStageDisplayName,
    nextStageKey: nextStage?.stage_key || null,
    nextStageDisplayName,
    groups: groupSections,
    totalInputPieces,
    totalMistakedPieces: totalEnteredSizesCount > 0 ? totalEnteredMistakedPieces : null,
    totalOutputPieces: totalEnteredSizesCount > 0 ? totalEnteredOutputPieces : null,
    totalRequiredSizesCount,
    totalEnteredSizesCount,
    allRequiredSizesEntered,
    missingSizesCount,
  };
}

/**
 * Completion check rule:
 * A dynamic stage cannot be completed unless every required size has an actual mistaked quantity entered.
 */
export function canCompleteStage(
  calculationResult: DynamicStageCalculationResult
): { canComplete: boolean; errorMessage?: string } {
  if (calculationResult.groups.length === 0) {
    return {
      canComplete: false,
      errorMessage: "No pieces are available from the previous stage.",
    };
  }

  if (!calculationResult.allRequiredSizesEntered) {
    return {
      canComplete: false,
      errorMessage:
        "Enter actual quantity for all required sizes before completing this stage.",
    };
  }

  return { canComplete: true };
}
