import assert from "assert";
import {
  calculateDynamicStage,
  canCompleteStage,
  buildDynamicGroupKey,
  buildDynamicSizeRowKey,
  StoredStageItem,
} from "../src/lib/production/dynamicStageEngine";
import { StoredCuttingItem } from "../src/lib/production/cuttingCalculations";
import { OrderWorkflowStage, ProductionStageKey } from "../src/lib/productionWorkflow";

console.log("=================================================================");
console.log("RUNNING PRINTING ACTUAL MISTAKED QUANTITY & ZERO FLOW SUITE (TESTS 1 - 12)");
console.log("=================================================================\n");

// Setup sample 10 sizes cutting items totaling 13 pieces
const cuttingItems: StoredCuttingItem[] = [
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "26", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 2 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "30", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "32", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "34", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "36", required_quantity: 1, cut_quantity: 2 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "38", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "40", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "42", required_quantity: 1, cut_quantity: 1 },
  { order_id: "o1", item_name: "Shirt", style_id: "s1", style_name: "Regular", color: "Blue", size: "44", required_quantity: 1, cut_quantity: 2 },
]; // Total cut = 13 pieces, 10 sizes

const workflows: OrderWorkflowStage[] = [
  { id: "1", order_id: "o1", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
  { id: "2", order_id: "o1", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
  { id: "3", order_id: "o1", stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
  { id: "4", order_id: "o1", stage_key: "printing", sequence_order: 4, status: "in_progress", started_at: null, completed_at: null },
  { id: "5", order_id: "o1", stage_key: "stitching", sequence_order: 5, status: "pending", started_at: null, completed_at: null },
  { id: "6", order_id: "o1", stage_key: "embroidering", sequence_order: 6, status: "pending", started_at: null, completed_at: null },
  { id: "7", order_id: "o1", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
  { id: "8", order_id: "o1", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
];

const gKey = buildDynamicGroupKey("Shirt", "s1", "Regular", "Blue");

// TEST 1 & 2: null / undefined = missing
console.log("TEST 1 & 2: null and undefined are treated as missing (not entered)");
const calcEmpty = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: {},
});
assert.strictEqual(calcEmpty.totalInputPieces, 13);
assert.strictEqual(calcEmpty.totalMistakedPieces, null, "Unentered mistaked total must be null, not 0");
assert.strictEqual(calcEmpty.totalOutputPieces, null, "Unentered output total must be null, not 0");
assert.strictEqual(calcEmpty.missingSizesCount, 10);
assert.strictEqual(calcEmpty.allRequiredSizesEntered, false);
assert.strictEqual(calcEmpty.groups[0].sizeRows[0].mistakedQuantity, null);
assert.strictEqual(calcEmpty.groups[0].sizeRows[0].outputQuantity, null);
assert.strictEqual(calcEmpty.groups[0].sizeRows[0].statusText, "Enter Quantity");
assert.strictEqual(calcEmpty.groups[0].sizeRows[0].statusType, "not_entered");
const canCompEmpty = canCompleteStage(calcEmpty);
assert.strictEqual(canCompEmpty.canComplete, false);
console.log("  ✓ TEST 1 & 2 PASS: null and undefined remain missing, totals are null, status is Enter Quantity.");

// TEST 3: 0 = valid
console.log("\nTEST 3: 0 is a valid entered quantity and NOT treated as missing");
const rKey26 = buildDynamicSizeRowKey(gKey, "26");
const calcZero = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: { [rKey26]: "0" },
});
const row26 = calcZero.groups[0].sizeRows.find((r) => r.size === "26")!;
assert.strictEqual(row26.mistakedQuantity, 0);
assert.strictEqual(row26.outputQuantity, 1); // Input 1 - Mistaked 0 = 1
assert.strictEqual(row26.resultDisplay, "1");
assert.strictEqual(row26.statusText, "Complete");
assert.strictEqual(row26.statusType, "complete");
assert.strictEqual(calcZero.missingSizesCount, 9);
assert.strictEqual(calcZero.totalEnteredSizesCount, 1);
assert.strictEqual(calcZero.totalMistakedPieces, 0);
assert.strictEqual(calcZero.totalOutputPieces, 1);
console.log("  ✓ TEST 3 PASS: 0 is valid, row is Complete, Output = Input - 0.");

// TEST 4: 1 = valid
console.log("\nTEST 4: 1 is a valid positive entered quantity");
const rKey28 = buildDynamicSizeRowKey(gKey, "28"); // input = 2
const calcOne = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: { [rKey28]: "1" },
});
const row28 = calcOne.groups[0].sizeRows.find((r) => r.size === "28")!;
assert.strictEqual(row28.mistakedQuantity, 1);
assert.strictEqual(row28.outputQuantity, 1); // Input 2 - Mistaked 1 = 1
assert.strictEqual(row28.resultDisplay, "1");
assert.strictEqual(row28.statusText, "Complete");
assert.strictEqual(row28.statusType, "mistaked");
console.log("  ✓ TEST 4 PASS: 1 is valid, Output = Input - 1.");

// TEST 5: Input 13 + Mistaked 0 = Output 13
console.log("\nTEST 5: Input 13 + Mistaked 0 = Output 13");
const allZeroInputs: Record<string, string> = {};
["26", "28", "30", "32", "34", "36", "38", "40", "42", "44"].forEach((sz) => {
  allZeroInputs[buildDynamicSizeRowKey(gKey, sz)] = "0";
});
const calcAllZero = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: allZeroInputs,
});
assert.strictEqual(calcAllZero.totalInputPieces, 13);
assert.strictEqual(calcAllZero.totalMistakedPieces, 0);
assert.strictEqual(calcAllZero.totalOutputPieces, 13);
assert.strictEqual(calcAllZero.missingSizesCount, 0);
assert.strictEqual(calcAllZero.allRequiredSizesEntered, true);
assert.strictEqual(canCompleteStage(calcAllZero).canComplete, true);
console.log("  ✓ TEST 5 PASS: Input 13 + Mistaked 0 = Output 13. All rows complete.");

// TEST 6: Input 13 + Mistaked 1 = Output 12
console.log("\nTEST 6: Input 13 + Mistaked 1 = Output 12");
const mistakedOneInputs = { ...allZeroInputs, [buildDynamicSizeRowKey(gKey, "28")]: "1" };
const calcMistakedOne = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: mistakedOneInputs,
});
assert.strictEqual(calcMistakedOne.totalInputPieces, 13);
assert.strictEqual(calcMistakedOne.totalMistakedPieces, 1);
assert.strictEqual(calcMistakedOne.totalOutputPieces, 12);
console.log("  ✓ TEST 6 PASS: Input 13 + Mistaked 1 = Output 12.");

// TEST 7: Input 13 + Mistaked 13 = Output 0
console.log("\nTEST 7: Input 13 + Mistaked 13 = Output 0");
const allMistakedInputs: Record<string, string> = {};
cuttingItems.forEach((ci) => {
  allMistakedInputs[buildDynamicSizeRowKey(gKey, ci.size)] = String(ci.cut_quantity);
});
const calcAllMistaked = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: allMistakedInputs,
});
assert.strictEqual(calcAllMistaked.totalInputPieces, 13);
assert.strictEqual(calcAllMistaked.totalMistakedPieces, 13);
assert.strictEqual(calcAllMistaked.totalOutputPieces, 0);
assert.strictEqual(calcAllMistaked.missingSizesCount, 0);
assert.strictEqual(calcAllMistaked.allRequiredSizesEntered, true);
console.log("  ✓ TEST 7 PASS: Output 0 is a valid complete result.");

// TEST 8: 10 rows all mistaked = 0 -> zero missing -> completion allowed
console.log("\nTEST 8: 10 rows all mistaked = 0 -> zero missing -> completion allowed");
assert.strictEqual(calcAllZero.missingSizesCount, 0);
assert.strictEqual(canCompleteStage(calcAllZero).canComplete, true);
console.log("  ✓ TEST 8 PASS: Completion allowed when all rows entered as 0.");

// TEST 9: 9 rows = 0, 1 row = null -> exactly 1 missing
console.log("\nTEST 9: 9 rows = 0, 1 row = null -> exactly 1 missing");
const nineZeroInputs = { ...allZeroInputs };
delete nineZeroInputs[buildDynamicSizeRowKey(gKey, "44")]; // delete row 44
const calcNineZero = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: [],
  liveInputs: nineZeroInputs,
});
assert.strictEqual(calcNineZero.missingSizesCount, 1);
assert.strictEqual(calcNineZero.totalEnteredSizesCount, 9);
assert.strictEqual(calcNineZero.allRequiredSizesEntered, false);
assert.strictEqual(canCompleteStage(calcNineZero).canComplete, false);
console.log("  ✓ TEST 9 PASS: Exactly 1 missing detected, completion blocked.");

// TEST 10: Verify 0 survives UI -> payload -> server -> database
console.log("\nTEST 10: Verify 0 survives through stored stage item format");
const savedItemsFromZero: StoredStageItem[] = cuttingItems.map((ci) => ({
  order_id: "o1",
  stage_key: "printing",
  sequence_order: 4,
  item_name: ci.item_name,
  style_id: ci.style_id,
  style_name: ci.style_name,
  color: ci.color,
  size: ci.size,
  input_quantity: ci.cut_quantity,
  actual_quantity: 0,
  result_quantity: ci.cut_quantity - 0,
  status: "completed",
}));
const calcFromSaved = calculateDynamicStage({
  stageKey: "printing",
  workflows,
  cuttingItems,
  stageItems: savedItemsFromZero,
});
assert.strictEqual(calcFromSaved.missingSizesCount, 0);
assert.strictEqual(calcFromSaved.totalMistakedPieces, 0);
assert.strictEqual(calcFromSaved.totalOutputPieces, 13);
console.log("  ✓ TEST 10 PASS: 0 in stageItems reconstitutes cleanly with 0 mistaked and 13 output.");

// TEST 11: Verify next stage receives Output, not Mistaked Quantity
console.log("\nTEST 11: Verify next stage (Stitching) receives Output (13), NOT Mistaked (0)");
const nextStageCalc = calculateDynamicStage({
  stageKey: "stitching",
  workflows,
  cuttingItems,
  stageItems: savedItemsFromZero,
});
assert.strictEqual(nextStageCalc.previousStageKey, "printing");
assert.strictEqual(nextStageCalc.totalInputPieces, 13, "Next stage input must be 13 (Printing Output), not 0!");
console.log("  ✓ TEST 11 PASS: Next stage receives 13 pieces.");

// TEST 12: Verify all 6 dynamic production permutations
console.log("\nTEST 12: Verify all 6 production permutations propagate Output correctly");
const permutations: ProductionStageKey[][] = [
  ["stitching", "printing", "embroidering"],
  ["stitching", "embroidering", "printing"],
  ["printing", "stitching", "embroidering"],
  ["printing", "embroidering", "stitching"],
  ["embroidering", "stitching", "printing"],
  ["embroidering", "printing", "stitching"],
];

permutations.forEach((perm, idx) => {
  const permWfs: OrderWorkflowStage[] = [
    { id: "1", order_id: "o1", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { id: "2", order_id: "o1", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { id: "3", order_id: "o1", stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
    { id: "4", order_id: "o1", stage_key: perm[0], sequence_order: 4, status: "in_progress", started_at: null, completed_at: null },
    { id: "5", order_id: "o1", stage_key: perm[1], sequence_order: 5, status: "pending", started_at: null, completed_at: null },
    { id: "6", order_id: "o1", stage_key: perm[2], sequence_order: 6, status: "pending", started_at: null, completed_at: null },
    { id: "7", order_id: "o1", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { id: "8", order_id: "o1", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  // Stage 4 receives Cut Quantity = 13
  const st4Calc = calculateDynamicStage({
    stageKey: perm[0],
    workflows: permWfs,
    cuttingItems,
    stageItems: [],
  });
  assert.strictEqual(st4Calc.totalInputPieces, 13);

  // Suppose Admin enters 0 mistaked for Stage 4 -> Output = 13
  const st4Saved: StoredStageItem[] = cuttingItems.map((ci) => ({
    order_id: "o1",
    stage_key: perm[0],
    sequence_order: 4,
    item_name: ci.item_name,
    style_id: ci.style_id,
    style_name: ci.style_name,
    color: ci.color,
    size: ci.size,
    input_quantity: ci.cut_quantity,
    actual_quantity: 0,
    result_quantity: ci.cut_quantity - 0,
    status: "completed",
  }));

  // Stage 5 receives Stage 4 Output = 13
  const st5Calc = calculateDynamicStage({
    stageKey: perm[1],
    workflows: permWfs,
    cuttingItems,
    stageItems: st4Saved,
  });
  assert.strictEqual(st5Calc.totalInputPieces, 13);
  console.log(`  ✓ Permutation #${idx + 1} (${perm.join(" -> ")}): Stage 4 input = 13, Stage 5 input = 13.`);
});

console.log("\n=================================================================");
console.log("ALL 12 PRINTING & ZERO FLOW ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!");
console.log("=================================================================\n");
