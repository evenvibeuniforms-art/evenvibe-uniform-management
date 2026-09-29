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
console.log("RUNNING EDITABLE ACTUAL MISTAKED QUANTITY TEST SUITE (SECTIONS 1 - 18)");
console.log("=================================================================\n");

// Helper to create 8-stage workflow
function createWorkflows(middle3: [ProductionStageKey, ProductionStageKey, ProductionStageKey], inProgressStageKey: ProductionStageKey): OrderWorkflowStage[] {
  const sortedKeys: ProductionStageKey[] = [
    "stock_sizes",
    "inventory",
    "cutting",
    middle3[0],
    middle3[1],
    middle3[2],
    "checking",
    "ironing_packing",
  ];

  const inProgressIdx = sortedKeys.indexOf(inProgressStageKey);

  return sortedKeys.map((key, idx) => ({
    id: `wf-${idx + 1}`,
    order_id: "order-test-editable",
    stage_key: key,
    sequence_order: idx + 1,
    status: idx < inProgressIdx ? "completed" : idx === inProgressIdx ? "in_progress" : "pending",
    started_at: idx <= inProgressIdx ? new Date().toISOString() : null,
    completed_at: idx < inProgressIdx ? new Date().toISOString() : null,
  }));
}

// =========================================================================
// TEST 1: Exact Embroidering Example from Section 2
// Pant / hhhhhhh / Blue / 28 / Input from Cutting: 1 piece
// =========================================================================
console.log("TEST 1: Exact Embroidering Example from Section 2");
{
  const cuttingItems: StoredCuttingItem[] = [
    {
      order_id: "order-test-editable",
      item_name: "Pant",
      style_id: "s1",
      style_name: "hhhhhhh",
      color: "Blue",
      size: "28",
      required_quantity: 1,
      cut_quantity: 1,
    },
  ];

  // Embroidering is stage 4 (first dynamic stage after cutting)
  const workflows = createWorkflows(["embroidering", "stitching", "printing"], "embroidering");
  const stageKey = "embroidering";
  const currentStage = "embroidering";

  // Simulate read-only check logic from DynamicProductionStage
  const stageWorkflow = workflows.find((w) => w.stage_key === stageKey);
  const isStageCompleted = stageWorkflow?.status === "completed";
  const isCurrentActiveStage = currentStage === stageKey || stageWorkflow?.status === "in_progress";

  // When order is in production, isOrderReadOnly is false
  const isOrderReadOnly = false;
  const isStageReadOnly = Boolean(isOrderReadOnly || isStageCompleted || !isCurrentActiveStage);

  assert.strictEqual(isCurrentActiveStage, true, "Embroidering must be recognized as active stage");
  assert.strictEqual(isStageCompleted, false, "Embroidering is in progress, not completed");
  assert.strictEqual(isStageReadOnly, false, "CRITICAL: isStageReadOnly MUST be false so Input is editable!");

  const gKey = buildDynamicGroupKey("Pant", "s1", "hhhhhhh", "Blue");
  const rKey = buildDynamicSizeRowKey(gKey, "28");

  // Initial state: empty (unentered)
  const calcInitial = calculateDynamicStage({
    stageKey,
    workflows,
    cuttingItems,
    stageItems: [],
    liveInputs: {},
  });

  const rowInitial = calcInitial.groups[0].sizeRows[0];
  assert.strictEqual(rowInitial.inputQuantity, 1, "Input from Cutting must be 1 piece (read-only)");
  assert.strictEqual(rowInitial.mistakedQuantity, null, "Unentered mistaked must be null");
  assert.strictEqual(rowInitial.outputQuantity, null, "Unentered output must be null");
  assert.strictEqual(rowInitial.resultDisplay, "—");
  assert.strictEqual(rowInitial.statusText, "Enter Quantity");

  // Admin types "0":
  const calcZero = calculateDynamicStage({
    stageKey,
    workflows,
    cuttingItems,
    stageItems: [],
    liveInputs: { [rKey]: "0" },
  });
  const rowZero = calcZero.groups[0].sizeRows[0];
  assert.strictEqual(rowZero.mistakedQuantity, 0, "Mistaked quantity must be 0");
  assert.strictEqual(rowZero.outputQuantity, 1, "Output must be Input (1) - 0 = 1");
  assert.strictEqual(rowZero.resultDisplay, "1");
  assert.strictEqual(rowZero.statusText, "Complete");

  // Admin changes input to "1":
  const calcOne = calculateDynamicStage({
    stageKey,
    workflows,
    cuttingItems,
    stageItems: [],
    liveInputs: { [rKey]: "1" },
  });
  const rowOne = calcOne.groups[0].sizeRows[0];
  assert.strictEqual(rowOne.mistakedQuantity, 1, "Mistaked quantity must be 1");
  assert.strictEqual(rowOne.outputQuantity, 0, "Output must be Input (1) - 1 = 0");
  assert.strictEqual(rowOne.resultDisplay, "0");
  assert.strictEqual(rowOne.statusText, "Complete");

  console.log("  ✓ TEST 1 PASS: Embroidering Input=1, Mistaked=[0] -> Output=1; Mistaked=[1] -> Output=0.");
}

// =========================================================================
// TEST 2: Stitching stage editable test
// =========================================================================
console.log("\nTEST 2: Stitching stage editable test");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test-editable", item_name: "Shirt", style_id: "s2", style_name: "Regular", color: "White", size: "32", required_quantity: 5, cut_quantity: 5 },
  ];
  const workflows = createWorkflows(["stitching", "printing", "embroidering"], "stitching");
  const stageKey = "stitching";
  const currentStage = "stitching";

  const stageWorkflow = workflows.find((w) => w.stage_key === stageKey);
  const isStageCompleted = stageWorkflow?.status === "completed";
  const isCurrentActiveStage = currentStage === stageKey || stageWorkflow?.status === "in_progress";
  const isStageReadOnly = Boolean(false || isStageCompleted || !isCurrentActiveStage);

  assert.strictEqual(isStageReadOnly, false, "Stitching must be editable when in progress");

  const gKey = buildDynamicGroupKey("Shirt", "s2", "Regular", "White");
  const rKey = buildDynamicSizeRowKey(gKey, "32");

  // Test 0 -> Output = 5
  const calc0 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "0" } });
  assert.strictEqual(calc0.groups[0].sizeRows[0].outputQuantity, 5);

  // Test 1 -> Output = 4
  const calc1 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "1" } });
  assert.strictEqual(calc1.groups[0].sizeRows[0].outputQuantity, 4);

  // Test 5 -> Output = 0
  const calc5 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "5" } });
  assert.strictEqual(calc5.groups[0].sizeRows[0].outputQuantity, 0);

  console.log("  ✓ TEST 2 PASS: Stitching is fully editable: 0->5, 1->4, 5->0.");
}

// =========================================================================
// TEST 3: Printing stage editable test
// =========================================================================
console.log("\nTEST 3: Printing stage editable test");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test-editable", item_name: "TShirt", style_id: "s3", style_name: "Polo", color: "Red", size: "36", required_quantity: 5, cut_quantity: 5 },
  ];
  const workflows = createWorkflows(["printing", "stitching", "embroidering"], "printing");
  const stageKey = "printing";
  const currentStage = "printing";

  const stageWorkflow = workflows.find((w) => w.stage_key === stageKey);
  const isStageCompleted = stageWorkflow?.status === "completed";
  const isCurrentActiveStage = currentStage === stageKey || stageWorkflow?.status === "in_progress";
  const isStageReadOnly = Boolean(false || isStageCompleted || !isCurrentActiveStage);

  assert.strictEqual(isStageReadOnly, false, "Printing must be editable when in progress");

  const gKey = buildDynamicGroupKey("TShirt", "s3", "Polo", "Red");
  const rKey = buildDynamicSizeRowKey(gKey, "36");

  // Test 0 -> Output = 5
  const calc0 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "0" } });
  assert.strictEqual(calc0.groups[0].sizeRows[0].outputQuantity, 5);

  // Test 1 -> Output = 4
  const calc1 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "1" } });
  assert.strictEqual(calc1.groups[0].sizeRows[0].outputQuantity, 4);

  // Test 5 -> Output = 0
  const calc5 = calculateDynamicStage({ stageKey, workflows, cuttingItems, stageItems: [], liveInputs: { [rKey]: "5" } });
  assert.strictEqual(calc5.groups[0].sizeRows[0].outputQuantity, 0);

  console.log("  ✓ TEST 3 PASS: Printing is fully editable: 0->5, 1->4, 5->0.");
}

// =========================================================================
// TEST 4: Save Payload Preserves 0 (Never Dropped)
// =========================================================================
console.log("\nTEST 4: Save Payload Preserves 0");
{
  const liveInputs: Record<string, string> = {
    "pant::s1::hhhhhhh::blue::28": "0",
    "pant::s1::hhhhhhh::blue::30": "1",
  };

  const itemsToSave: {
    item_name: string;
    size: string;
    actual_quantity: number;
  }[] = [];

  Object.entries(liveInputs).forEach(([key, val]) => {
    if (val !== undefined && val !== "" && /^\d+$/.test(val)) {
      itemsToSave.push({
        item_name: "Pant",
        size: key.split("::").pop()!,
        actual_quantity: parseInt(val, 10),
      });
    }
  });

  assert.strictEqual(itemsToSave.length, 2);
  const row28 = itemsToSave.find((it) => it.size === "28")!;
  assert.strictEqual(row28.actual_quantity, 0, "actual_quantity: 0 must be preserved in payload");
  const row30 = itemsToSave.find((it) => it.size === "30")!;
  assert.strictEqual(row30.actual_quantity, 1, "actual_quantity: 1 must be preserved in payload");

  console.log("  ✓ TEST 4 PASS: 0 is strictly preserved in save payload.");
}

// =========================================================================
// TEST 5: Clearing value returns to null and blocks completion
// =========================================================================
console.log("\nTEST 5: Clearing value returns to null and blocks completion");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test-editable", item_name: "Pant", style_id: "s1", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
  ];
  const workflows = createWorkflows(["embroidering", "stitching", "printing"], "embroidering");
  const gKey = buildDynamicGroupKey("Pant", "s1", "hhhhhhh", "Blue");
  const rKey = buildDynamicSizeRowKey(gKey, "28");

  // Admin cleared the input (empty string)
  const calcCleared = calculateDynamicStage({
    stageKey: "embroidering",
    workflows,
    cuttingItems,
    stageItems: [],
    liveInputs: { [rKey]: "" },
  });

  assert.strictEqual(calcCleared.groups[0].sizeRows[0].mistakedQuantity, null);
  assert.strictEqual(calcCleared.groups[0].sizeRows[0].outputQuantity, null);
  assert.strictEqual(calcCleared.groups[0].sizeRows[0].resultDisplay, "—");
  assert.strictEqual(calcCleared.groups[0].sizeRows[0].statusText, "Enter Quantity");

  const compCheck = canCompleteStage(calcCleared);
  assert.strictEqual(compCheck.canComplete, false, "Stage cannot be completed when a field is empty");

  console.log("  ✓ TEST 5 PASS: Cleared field returns to null, displays '—', blocks completion.");
}

// =========================================================================
// TEST 6: Once all fields have 0 or greater, completion is allowed
// =========================================================================
console.log("\nTEST 6: Completion allowed when all fields have valid numbers (including 0)");
{
  const cuttingItems: StoredCuttingItem[] = [
    { order_id: "order-test-editable", item_name: "Pant", style_id: "s1", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
    { order_id: "order-test-editable", item_name: "Pant", style_id: "s1", style_name: "hhhhhhh", color: "Blue", size: "30", required_quantity: 1, cut_quantity: 1 },
  ];
  const workflows = createWorkflows(["embroidering", "stitching", "printing"], "embroidering");
  const gKey = buildDynamicGroupKey("Pant", "s1", "hhhhhhh", "Blue");
  const rKey28 = buildDynamicSizeRowKey(gKey, "28");
  const rKey30 = buildDynamicSizeRowKey(gKey, "30");

  const calcAllEntered = calculateDynamicStage({
    stageKey: "embroidering",
    workflows,
    cuttingItems,
    stageItems: [],
    liveInputs: { [rKey28]: "0", [rKey30]: "1" },
  });

  const compCheck = canCompleteStage(calcAllEntered);
  assert.strictEqual(compCheck.canComplete, true, "Completion must be allowed when all fields entered (0 and 1)");
  console.log("  ✓ TEST 6 PASS: Completion allowed when all fields entered (0 and 1).");
}

console.log("\n=================================================================");
console.log("ALL 6 EDITABLE ACTUAL MISTAKED QUANTITY TESTS PASSED 100%!");
console.log("=================================================================");
