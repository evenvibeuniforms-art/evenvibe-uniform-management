import assert from "assert";
import {
  calculateDynamicStage,
  getStageInput,
  getStageOutput,
  calculateStageResult,
  validateStageInput,
  StoredStageItem,
} from "../src/lib/production/dynamicStageEngine";
import {
  calculateCuttingRequirements,
  StoredCuttingItem,
  ReqItemSnapshot,
} from "../src/lib/production/cuttingCalculations";
import { OrderWorkflowStage, ProductionStageKey } from "../src/lib/productionWorkflow";

console.log("=================================================================");
console.log("RUNNING CUTTING ACTUAL OUTPUT -> DYNAMIC STAGE FLOW SUITE (TESTS 1 - 12 + SECTION 22)");
console.log("=================================================================\n");

// Helper to create 8-stage workflow with custom middle 3 stages
function createWorkflows(middle3: [ProductionStageKey, ProductionStageKey, ProductionStageKey]): OrderWorkflowStage[] {
  return [
    { id: "1", order_id: "order-test", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { id: "2", order_id: "order-test", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { id: "3", order_id: "order-test", stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
    { id: "4", order_id: "order-test", stage_key: middle3[0], sequence_order: 4, status: "in_progress", started_at: null, completed_at: null },
    { id: "5", order_id: "order-test", stage_key: middle3[1], sequence_order: 5, status: "pending", started_at: null, completed_at: null },
    { id: "6", order_id: "order-test", stage_key: middle3[2], sequence_order: 6, status: "pending", started_at: null, completed_at: null },
    { id: "7", order_id: "order-test", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { id: "8", order_id: "order-test", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];
}

// =========================================================================
// TEST 1: Required = 10, Cut = 1, Result = -9 -> Cutting Output = 1, Next Input = 1
// =========================================================================
console.log("TEST 1: Required = 10, Cut = 1, Result = -9");
{
  const reqItems: ReqItemSnapshot[] = [
    { id: "r1", requirement_id: "req1", class_name: "Class 1", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", quantity: 10 },
  ];
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
  ];
  const cutRes = calculateCuttingRequirements(reqItems, cuttingItems);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].required, 10);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].cut, 1);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].result, -9);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].statusText, "9 Pending");

  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const dynCalc = calculateDynamicStage({
    stageKey: "stitching",
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });
  const row = dynCalc.groups[0].sizeRows[0];
  assert.strictEqual(row.inputQuantity, 1, "First dynamic stage input MUST be cut_quantity (1), NOT required (10) and NOT result (-9)");
  console.log("  ✓ TEST 1 PASS: Cutting Output = 1, First Dynamic Stage Input = 1 (NOT 10, NOT -9).");
}

// =========================================================================
// TEST 2: Required = 10, Cut = 12, Result = +2 -> Cutting Output = 12, Next Input = 12
// =========================================================================
console.log("\nTEST 2: Required = 10, Cut = 12, Result = +2");
{
  const reqItems: ReqItemSnapshot[] = [
    { id: "r1", requirement_id: "req1", class_name: "Class 1", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", quantity: 10 },
  ];
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 12 },
  ];
  const cutRes = calculateCuttingRequirements(reqItems, cuttingItems);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].required, 10);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].cut, 12);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].result, 2);
  assert.strictEqual(cutRes.groups[0].sizeRows[0].statusText, "2 Extra Cut");

  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const dynCalc = calculateDynamicStage({
    stageKey: "stitching",
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });
  const row = dynCalc.groups[0].sizeRows[0];
  assert.strictEqual(row.inputQuantity, 12, "First dynamic stage input MUST be cut_quantity (12), NOT extra cut (2)");
  console.log("  ✓ TEST 2 PASS: Cutting Output = 12, First Dynamic Stage Input = 12 (NOT 2).");
}

// =========================================================================
// TEST 3: Required = 10, Cut = 10, Result = 0 -> Cutting Output = 10, Next Input = 10
// =========================================================================
console.log("\nTEST 3: Required = 10, Cut = 10, Result = 0");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 10 },
  ];
  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const dynCalc = calculateDynamicStage({
    stageKey: "stitching",
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });
  assert.strictEqual(dynCalc.groups[0].sizeRows[0].inputQuantity, 10);
  console.log("  ✓ TEST 3 PASS: Cutting Output = 10, First Dynamic Stage Input = 10.");
}

// =========================================================================
// TEST 4: Style A / Blue / 26 -> Identity preserved
// =========================================================================
console.log("\nTEST 4: Style A / Blue / 26 identity preservation");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
  ];
  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const dynCalc = calculateDynamicStage({
    stageKey: "stitching",
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });
  const grp = dynCalc.groups[0];
  assert.strictEqual(grp.itemName, "Shirt");
  assert.strictEqual(grp.cleanStyleName, "Style A");
  assert.strictEqual(grp.displayColor, "Blue");
  assert.strictEqual(grp.sizeRows[0].size, "26");
  assert.strictEqual(grp.sizeRows[0].inputQuantity, 1);
  console.log("  ✓ TEST 4 PASS: Style A / Blue / 26 correctly preserved.");
}

// =========================================================================
// TEST 5: Style A / Blue / 26 (Cut=1) and 28 (Cut=5) -> No cross-row mixing
// =========================================================================
console.log("\nTEST 5: Multi-size and multi-style isolation");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "28", required_quantity: 8, cut_quantity: 5 },
    { order_id: "order-test", item_name: "Shirt", style_id: "s2", style_name: "Style B", color: "Yellow", size: "30", required_quantity: 12, cut_quantity: 2 },
  ];
  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const dynCalc = calculateDynamicStage({
    stageKey: "stitching",
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });

  assert.strictEqual(dynCalc.groups.length, 2, "Must have exactly 2 distinct groups");
  const grpA = dynCalc.groups.find((g) => g.cleanStyleName === "Style A")!;
  const grpB = dynCalc.groups.find((g) => g.cleanStyleName === "Style B")!;

  const r26 = grpA.sizeRows.find((r) => r.size === "26")!;
  const r28 = grpA.sizeRows.find((r) => r.size === "28")!;
  const r30 = grpB.sizeRows.find((r) => r.size === "30")!;

  assert.strictEqual(r26.inputQuantity, 1);
  assert.strictEqual(r28.inputQuantity, 5);
  assert.strictEqual(r30.inputQuantity, 2);
  console.log("  ✓ TEST 5 PASS: Style A (26=1, 28=5) and Style B (30=2) isolated without cross-row mixing.");
}

// =========================================================================
// TEST 6: Cutting Output = 1, Mistaked = 0 -> Dynamic Output = 1
// =========================================================================
console.log("\nTEST 6: Cutting Output = 1, Mistaked = 0 -> Dynamic Output = 1");
{
  const out = getStageOutput(1, 0);
  assert.strictEqual(out, 1);
  const res = calculateStageResult(1, 0);
  assert.strictEqual(res, 1);
  console.log("  ✓ TEST 6 PASS: Input 1 - Mistaked 0 = Output 1.");
}

// =========================================================================
// TEST 7: Cutting Output = 1, Mistaked = 1 -> Dynamic Output = 0
// =========================================================================
console.log("\nTEST 7: Cutting Output = 1, Mistaked = 1 -> Dynamic Output = 0");
{
  const out = getStageOutput(1, 1);
  assert.strictEqual(out, 0);
  const res = calculateStageResult(1, 1);
  assert.strictEqual(res, 0);
  console.log("  ✓ TEST 7 PASS: Input 1 - Mistaked 1 = Output 0.");
}

// =========================================================================
// TEST 8, 9, 10: Multi-stage cascade: Cutting -> Stage 4 -> Stage 5 -> Stage 6 -> Checking
// =========================================================================
console.log("\nTEST 8, 9, 10: Multi-stage cascade flow to Checking");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
  ];
  const wf = createWorkflows(["stitching", "printing", "embroidering"]);

  // Stage 4: Stitching
  const stage4Items: StoredStageItem[] = [
    {
      order_id: "order-test",
      stage_key: "stitching",
      sequence_order: 4,
      item_name: "Shirt",
      style_id: "s1",
      style_name: "Style A",
      color: "Blue",
      size: "26",
      input_quantity: 1,
      actual_quantity: 0, // Mistaked = 0
      result_quantity: 1, // Output = 1
    },
  ];

  // Stage 5: Printing (receives Stitching Output = 1)
  const stage5Input = getStageInput({
    stageKey: "printing",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: stage4Items,
  });
  assert.strictEqual(stage5Input, 1, "TEST 8: Second dynamic stage must receive previous stage output (1)");

  const stage5Items: StoredStageItem[] = [
    ...stage4Items,
    {
      order_id: "order-test",
      stage_key: "printing",
      sequence_order: 5,
      item_name: "Shirt",
      style_id: "s1",
      style_name: "Style A",
      color: "Blue",
      size: "26",
      input_quantity: 1,
      actual_quantity: 0, // Mistaked = 0
      result_quantity: 1, // Output = 1
    },
  ];

  // Stage 6: Embroidering (receives Printing Output = 1)
  const stage6Input = getStageInput({
    stageKey: "embroidering",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: stage5Items,
  });
  assert.strictEqual(stage6Input, 1, "TEST 9: Third dynamic stage must receive second dynamic output (1)");

  const stage6Items: StoredStageItem[] = [
    ...stage5Items,
    {
      order_id: "order-test",
      stage_key: "embroidering",
      sequence_order: 6,
      item_name: "Shirt",
      style_id: "s1",
      style_name: "Style A",
      color: "Blue",
      size: "26",
      input_quantity: 1,
      actual_quantity: 0, // Mistaked = 0
      result_quantity: 1, // Output = 1
    },
  ];

  // Stage 7: Checking (receives Embroidering Output = 1)
  const checkingInput = getStageInput({
    stageKey: "checking",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: stage6Items,
  });
  assert.strictEqual(checkingInput, 1, "TEST 10: Checking must receive final dynamic stage output (1)");

  console.log("  ✓ TEST 8 PASS: Second dynamic stage receives previous dynamic output (1).");
  console.log("  ✓ TEST 9 PASS: Third dynamic stage receives second dynamic output (1).");
  console.log("  ✓ TEST 10 PASS: Checking receives final dynamic output (1).");
}

// =========================================================================
// TEST 11: All 6 Production Sequence Permutations
// =========================================================================
console.log("\nTEST 11: All 6 production permutations propagate Cut Quantity");
{
  const permutations: [ProductionStageKey, ProductionStageKey, ProductionStageKey][] = [
    ["stitching", "printing", "embroidering"],
    ["stitching", "embroidering", "printing"],
    ["printing", "stitching", "embroidering"],
    ["printing", "embroidering", "stitching"],
    ["embroidering", "stitching", "printing"],
    ["embroidering", "printing", "stitching"],
  ];

  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
  ];

  permutations.forEach((perm, idx) => {
    const wf = createWorkflows(perm);
    const firstStageKey = perm[0];
    const dynCalc = calculateDynamicStage({
      stageKey: firstStageKey,
      workflows: wf,
      cuttingItems,
      stageItems: [],
    });
    const row = dynCalc.groups[0].sizeRows[0];
    assert.strictEqual(row.inputQuantity, 1, `Permutation #${idx + 1} (${perm.join(" -> ")}): Stage 4 input must be Cut Quantity (1)`);
    console.log(`  ✓ Permutation #${idx + 1} (${perm.join(" -> ")}): ${firstStageKey} input = 1.`);
  });
  console.log("  ✓ TEST 11 PASS: All 6 permutations tested and verified.");
}

// =========================================================================
// TEST 12: Server-side validation rejects fabricated input quantity
// =========================================================================
console.log("\nTEST 12: Server-side validation rejects fabricated input quantity");
{
  const expectedAuthInput = 1;
  const clientInputAttempt10 = 10;
  const clientInputAttemptNeg9 = -9;
  const clientInputAttempt1 = 1;

  assert.strictEqual(validateStageInput(clientInputAttempt10, expectedAuthInput), false);
  assert.strictEqual(validateStageInput(clientInputAttemptNeg9, expectedAuthInput), false);
  assert.strictEqual(validateStageInput(clientInputAttempt1, expectedAuthInput), true);

  console.log("  ✓ TEST 12 PASS: Client input 10 and -9 rejected. Client input 1 accepted.");
}

// =========================================================================
// SECTION 22: EXACT ACCEPTANCE EXAMPLE
// =========================================================================
console.log("\n=================================================================");
console.log("SECTION 22: VERIFYING EXACT ACCEPTANCE SCENARIO");
console.log("=================================================================");
{
  // CUTTING:
  // Style: Style A, Color: Blue, Size: 26, Required: 10, Cut: 1, Result: -9, Output: 1
  const reqItems: ReqItemSnapshot[] = [
    { id: "r1", requirement_id: "req1", class_name: "Class 1", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", quantity: 10 },
  ];
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26", required_quantity: 10, cut_quantity: 1 },
  ];

  const cutRes = calculateCuttingRequirements(reqItems, cuttingItems);
  const cutRow = cutRes.groups[0].sizeRows[0];
  assert.strictEqual(cutRow.required, 10);
  assert.strictEqual(cutRow.cut, 1);
  assert.strictEqual(cutRow.result, -9);
  const actualCuttingOutput = cutRow.cut!;
  assert.strictEqual(actualCuttingOutput, 1);
  console.log("✓ Cutting: Required=10, Cut=1, Result=-9, Actual Output=1");

  // FIRST DYNAMIC STAGE (Stitching):
  // Input: 1, Mistaked: 0, Output: 1
  const wf = createWorkflows(["stitching", "printing", "embroidering"]);
  const stage4Input = getStageInput({
    stageKey: "stitching",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: [],
  });
  assert.strictEqual(stage4Input, 1);
  const stage4Mistaked = 0;
  const stage4Output = getStageOutput(stage4Input, stage4Mistaked);
  assert.strictEqual(stage4Output, 1);
  console.log("✓ First Dynamic Stage (Stitching): Input=1, Mistaked=0, Output=1");

  const stage4Saved: StoredStageItem = {
    order_id: "order-test",
    stage_key: "stitching",
    sequence_order: 4,
    item_name: "Shirt",
    style_id: "s1",
    style_name: "Style A",
    color: "Blue",
    size: "26",
    input_quantity: stage4Input,
    actual_quantity: stage4Mistaked,
    result_quantity: stage4Output,
  };

  // SECOND DYNAMIC STAGE (Printing):
  // Input: 1, Mistaked: 0, Output: 1
  const stage5Input = getStageInput({
    stageKey: "printing",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: [stage4Saved],
  });
  assert.strictEqual(stage5Input, 1);
  const stage5Mistaked = 0;
  const stage5Output = getStageOutput(stage5Input, stage5Mistaked);
  assert.strictEqual(stage5Output, 1);
  console.log("✓ Second Dynamic Stage (Printing): Input=1, Mistaked=0, Output=1");

  const stage5Saved: StoredStageItem = {
    order_id: "order-test",
    stage_key: "printing",
    sequence_order: 5,
    item_name: "Shirt",
    style_id: "s1",
    style_name: "Style A",
    color: "Blue",
    size: "26",
    input_quantity: stage5Input,
    actual_quantity: stage5Mistaked,
    result_quantity: stage5Output,
  };

  // THIRD DYNAMIC STAGE (Embroidering):
  // Input: 1, Mistaked: 0, Output: 1
  const stage6Input = getStageInput({
    stageKey: "embroidering",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: [stage4Saved, stage5Saved],
  });
  assert.strictEqual(stage6Input, 1);
  const stage6Mistaked = 0;
  const stage6Output = getStageOutput(stage6Input, stage6Mistaked);
  assert.strictEqual(stage6Output, 1);
  console.log("✓ Third Dynamic Stage (Embroidering): Input=1, Mistaked=0, Output=1");

  const stage6Saved: StoredStageItem = {
    order_id: "order-test",
    stage_key: "embroidering",
    sequence_order: 6,
    item_name: "Shirt",
    style_id: "s1",
    style_name: "Style A",
    color: "Blue",
    size: "26",
    input_quantity: stage6Input,
    actual_quantity: stage6Mistaked,
    result_quantity: stage6Output,
  };

  // CHECKING:
  // Input: 1
  const checkingInput = getStageInput({
    stageKey: "checking",
    item: { item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "26" },
    workflows: wf,
    cuttingItems,
    stageItems: [stage4Saved, stage5Saved, stage6Saved],
  });
  assert.strictEqual(checkingInput, 1);
  console.log("✓ Checking: Input=1");

  console.log("\n=================================================================");
  console.log("ALL ACCEPTANCE TESTS + SECTION 22 EXACT EXAMPLE PASSED 100%!");
  console.log("=================================================================");
}
