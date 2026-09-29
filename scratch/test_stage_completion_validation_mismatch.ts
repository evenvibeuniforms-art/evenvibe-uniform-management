import {
  calculateDynamicStage,
  canCompleteStage,
  getStageInputItems,
  getProductionSequence,
  getPreviousStage,
  getNextStage,
  buildDynamicGroupKey,
  buildDynamicSizeRowKey,
  StoredStageItem,
} from "../src/lib/production/dynamicStageEngine";
import { StoredCuttingItem } from "../src/lib/production/cuttingCalculations";
import { OrderWorkflowStage } from "../src/lib/productionWorkflow";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    console.log(`✅ ${msg}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("RUNNING STAGE COMPLETION VALIDATION MISMATCH TEST SUITE");
  console.log("==================================================================\n");

  const orderId = "order-test-validation-1";

  // Sequence: cutting (3) -> printing (4) -> stitching (5) -> embroidering (6) -> checking (7) -> ironing_packing (8)
  const baseWorkflows: OrderWorkflowStage[] = [
    { id: "w1", order_id: orderId, stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { id: "w2", order_id: orderId, stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { id: "w3", order_id: orderId, stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
    { id: "w4", order_id: orderId, stage_key: "printing", sequence_order: 4, status: "in_progress", started_at: null, completed_at: null },
    { id: "w5", order_id: orderId, stage_key: "stitching", sequence_order: 5, status: "pending", started_at: null, completed_at: null },
    { id: "w6", order_id: orderId, stage_key: "embroidering", sequence_order: 6, status: "pending", started_at: null, completed_at: null },
    { id: "w7", order_id: orderId, stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { id: "w8", order_id: orderId, stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  // ---------------------------------------------------------------------------------
  // TEST 1: Input = 1, Mistaked = 0 => Expected complete, Output = 1
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 1: Input = 1, Mistaked = 0 => Expected complete, Output = 1 ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
    ];
    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs: { [pantRowKey]: "0" },
    });

    assert(result.groups.length === 1, "One group created for Pant");
    const row = result.groups[0].sizeRows[0];
    assert(row.inputQuantity === 1, "Input quantity is 1");
    assert(row.mistakedQuantity === 0, "Mistaked quantity is 0");
    assert(row.outputQuantity === 1, "Output quantity is 1");
    assert(row.statusType === "complete", "Status type is 'complete'");
    assert(row.statusText === "Complete", "Status text is 'Complete'");
    assert(result.allRequiredSizesEntered === true, "allRequiredSizesEntered is true");
    assert(result.missingSizesCount === 0, "missingSizesCount is 0");

    const check = canCompleteStage(result);
    assert(check.canComplete === true, "canCompleteStage returns true for Mistaked = 0");
  }

  // ---------------------------------------------------------------------------------
  // TEST 2: Input = 1, Mistaked = 1 => Expected output = 0, Status = Complete
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 2: Input = 1, Mistaked = 1 => Expected output = 0 ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
    ];
    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs: { [pantRowKey]: "1" },
    });

    const row = result.groups[0].sizeRows[0];
    assert(row.inputQuantity === 1, "Input is 1");
    assert(row.mistakedQuantity === 1, "Mistaked is 1");
    assert(row.outputQuantity === 0, "Output is 0");
    assert(row.statusType === "mistaked", "Status type is mistaked");
    assert(row.statusText === "Complete", "Status text is Complete");
    assert(result.allRequiredSizesEntered === true, "allRequiredSizesEntered is true");

    const check = canCompleteStage(result);
    assert(check.canComplete === true, "canCompleteStage returns true");
  }

  // ---------------------------------------------------------------------------------
  // TEST 3 & 4: Input = 1, Mistaked = null / undefined => Expected incomplete
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 3 & 4: Input = 1, Mistaked = null / undefined => Expected incomplete ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
    ];

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs: {}, // undefined
    });

    const row = result.groups[0].sizeRows[0];
    assert(row.inputQuantity === 1, "Input is 1");
    assert(row.mistakedQuantity === null, "Mistaked is null");
    assert(row.outputQuantity === null, "Output is null");
    assert(row.statusType === "not_entered", "Status type is not_entered");
    assert(row.statusText === "Enter Quantity", "Status text is 'Enter Quantity'");
    assert(result.allRequiredSizesEntered === false, "allRequiredSizesEntered is false");
    assert(result.missingSizesCount === 1, "missingSizesCount is 1");

    const check = canCompleteStage(result);
    assert(check.canComplete === false, "canCompleteStage returns false");
    assert(
      check.errorMessage === "Enter actual quantity for all required sizes before completing this stage.",
      "Exact matching error message returned"
    );
  }

  // ---------------------------------------------------------------------------------
  // TEST 5: EXACT SCREENSHOT SCENARIO: Pant (1), Shirt (28: 1, 30: 1) all Mistaked = 0
  // Total Input = 3, Total Mistaked = 0, Total Output = 3 => Completion SUCCESS
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 5: EXACT SCREENSHOT SCENARIO (Pant 1, Shirt 28: 1, 30: 1, all 0 mistaked) ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", required_quantity: 1, cut_quantity: 1 },
    ];

    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");
    const shirtKey = buildDynamicGroupKey("Shirt", null, "style drak", "Blue");
    const shirt28RowKey = buildDynamicSizeRowKey(shirtKey, "28");
    const shirt30RowKey = buildDynamicSizeRowKey(shirtKey, "30");

    const liveInputs: Record<string, string> = {
      [pantRowKey]: "0",
      [shirt28RowKey]: "0",
      [shirt30RowKey]: "0",
    };

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs,
    });

    assert(result.totalInputPieces === 3, "Total Input is 3");
    assert(result.totalMistakedPieces === 0, "Total Mistaked is 0");
    assert(result.totalOutputPieces === 3, "Total Output is 3");
    assert(result.totalRequiredSizesCount === 3, "Total Required Sizes is 3");
    assert(result.totalEnteredSizesCount === 3, "Total Entered Sizes is 3");
    assert(result.missingSizesCount === 0, "Missing Sizes is 0");
    assert(result.allRequiredSizesEntered === true, "allRequiredSizesEntered is true");

    const check = canCompleteStage(result);
    assert(check.canComplete === true, "Completion check SUCCEEDS");

    // Simulate save payload construction
    const itemsToSave: {
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      input_quantity: number;
      actual_quantity: number;
    }[] = [];

    for (const g of result.groups) {
      for (const r of g.sizeRows) {
        const val = liveInputs[r.rowKey];
        const isMissing = val === undefined || val === null || val.trim() === "";
        assert(!isMissing, `Row ${g.itemName} ${r.size} is not missing`);
        const actualNum = parseInt(val.trim(), 10);
        assert(actualNum === 0, `Row ${g.itemName} ${r.size} actual_quantity is 0`);
        itemsToSave.push({
          item_name: g.itemName,
          style_id: g.styleId,
          style_name: g.styleName,
          color: g.color,
          size: r.size,
          input_quantity: r.inputQuantity,
          actual_quantity: actualNum,
        });
      }
    }

    assert(itemsToSave.length === 3, "3 items prepared for saving");
    assert(itemsToSave.every((it) => it.actual_quantity === 0), "All 3 items have actual_quantity === 0");
  }

  // ---------------------------------------------------------------------------------
  // TEST 6: 3 operational rows, 2 entered (0), 1 missing => Expected completion FAIL
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 6: 3 operational rows, 2 entered, 1 missing => completion FAIL ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", required_quantity: 1, cut_quantity: 1 },
    ];

    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");
    const shirtKey = buildDynamicGroupKey("Shirt", null, "style drak", "Blue");
    const shirt28RowKey = buildDynamicSizeRowKey(shirtKey, "28");

    // Only Pant and Shirt 28 entered, Shirt 30 missing
    const liveInputs: Record<string, string> = {
      [pantRowKey]: "0",
      [shirt28RowKey]: "0",
    };

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs,
    });

    assert(result.totalRequiredSizesCount === 3, "Total required is 3");
    assert(result.totalEnteredSizesCount === 2, "Total entered is 2");
    assert(result.missingSizesCount === 1, "Missing count is 1");
    assert(result.allRequiredSizesEntered === false, "allRequiredSizesEntered is false");

    const check = canCompleteStage(result);
    assert(check.canComplete === false, "canCompleteStage returns false");
  }

  // ---------------------------------------------------------------------------------
  // TEST 7: Previous stage output = 0 => Row EXCLUDED from current completion validation
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 7: Previous stage output = 0 => Row excluded from current validation ---");
  {
    // Order cutting items has Shirt 26 with cut_quantity = 0 (un-cut or zero cut)
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "26", required_quantity: 1, cut_quantity: 0 }, // ZERO OUTPUT
      { order_id: orderId, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
    ];

    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");
    const shirtKey = buildDynamicGroupKey("Shirt", null, "style drak", "Blue");
    const shirt28RowKey = buildDynamicSizeRowKey(shirtKey, "28");

    const liveInputs: Record<string, string> = {
      [pantRowKey]: "0",
      [shirt28RowKey]: "0",
    };

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
      liveInputs,
    });

    // Shirt 26 must NOT be in groups or counted in required sizes
    assert(result.totalRequiredSizesCount === 2, "Total required sizes is exactly 2 (Size 26 excluded)");
    assert(result.totalEnteredSizesCount === 2, "Total entered sizes is 2");
    assert(result.missingSizesCount === 0, "Missing sizes is 0");
    assert(result.allRequiredSizesEntered === true, "allRequiredSizesEntered is true");

    const check = canCompleteStage(result);
    assert(check.canComplete === true, "Completion succeeds despite Shirt 26 having 0 cut quantity");
  }

  // ---------------------------------------------------------------------------------
  // TEST 8: Mixed positive and zero outputs across dynamic middle stages
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 8: Mixed positive and zero outputs downstream ---");
  {
    // Suppose Printing (Stage 4) completes:
    // Pant 28: Input 1 -> Mistaked 0 -> Output 1
    // Shirt 28: Input 1 -> Mistaked 1 -> Output 0
    // Shirt 30: Input 1 -> Mistaked 0 -> Output 1
    const printingSavedItems: StoredStageItem[] = [
      { order_id: orderId, stage_key: "printing", sequence_order: 4, item_name: "Pant", style_name: "hhhhhhh", color: "Blue", size: "28", input_quantity: 1, actual_quantity: 0, result_quantity: 1, status: "completed" },
      { order_id: orderId, stage_key: "printing", sequence_order: 4, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", input_quantity: 1, actual_quantity: 1, result_quantity: 0, status: "completed" },
      { order_id: orderId, stage_key: "printing", sequence_order: 4, item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", input_quantity: 1, actual_quantity: 0, result_quantity: 1, status: "completed" },
    ];

    const stitchingWfs: OrderWorkflowStage[] = baseWorkflows.map((w) => {
      if (w.stage_key === "printing") return { ...w, status: "completed" };
      if (w.stage_key === "stitching") return { ...w, status: "in_progress" };
      return w;
    });

    const stitchingInputs = getStageInputItems({
      stageKey: "stitching",
      workflows: stitchingWfs,
      cuttingItems: [],
      stageItems: printingSavedItems,
    });

    assert(stitchingInputs.items.length === 2, "Stitching receives exactly 2 operational items (Shirt 28 with 0 output excluded)");
    assert(stitchingInputs.items.some((it) => it.itemName === "Pant" && it.size === "28" && it.inputQuantity === 1), "Pant 28 present");
    assert(stitchingInputs.items.some((it) => it.itemName === "Shirt" && it.size === "30" && it.inputQuantity === 1), "Shirt 30 present");
    assert(!stitchingInputs.items.some((it) => it.size === "28" && it.itemName === "Shirt"), "Shirt 28 with output 0 absent");

    // Admin enters 0 for both active Stitching rows
    const pantKey = buildDynamicGroupKey("Pant", null, "hhhhhhh", "Blue");
    const pantRowKey = buildDynamicSizeRowKey(pantKey, "28");
    const shirtKey = buildDynamicGroupKey("Shirt", null, "style drak", "Blue");
    const shirt30RowKey = buildDynamicSizeRowKey(shirtKey, "30");

    const stitchingResult = calculateDynamicStage({
      stageKey: "stitching",
      workflows: stitchingWfs,
      cuttingItems: [],
      stageItems: printingSavedItems,
      liveInputs: {
        [pantRowKey]: "0",
        [shirt30RowKey]: "0",
      },
    });

    assert(stitchingResult.totalRequiredSizesCount === 2, "Stitching requires 2 operational sizes");
    assert(stitchingResult.totalEnteredSizesCount === 2, "Stitching entered 2 sizes");
    assert(stitchingResult.allRequiredSizesEntered === true, "allRequiredSizesEntered is true");
    assert(canCompleteStage(stitchingResult).canComplete === true, "Stitching canCompleteStage succeeds");
  }

  // ---------------------------------------------------------------------------------
  // TEST 9 & 10: Verify 0 survives UI -> payload -> state without turning into null
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 9 & 10: 0 survives UI state and payload construction ---");
  {
    const valStr = "0";
    const isMissing = valStr === undefined || valStr === null || valStr.trim() === "";
    assert(!isMissing, "'0' is NOT missing");
    const actualNum = parseInt(valStr.trim(), 10);
    assert(actualNum === 0, "actualNum is exactly 0");
    assert(actualNum !== null, "actualNum is NOT null");
    assert(actualNum !== undefined, "actualNum is NOT undefined");

    const payloadItem = {
      item_name: "Pant",
      size: "28",
      input_quantity: 1,
      actual_quantity: actualNum,
    };

    assert(payloadItem.actual_quantity === 0, "Payload actual_quantity is 0");
    assert(JSON.stringify(payloadItem) === '{"item_name":"Pant","size":"28","input_quantity":1,"actual_quantity":0}', "JSON serialization preserves 0");
  }

  // ---------------------------------------------------------------------------------
  // TEST 11: All 6 dynamic production sequence permutations
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 11: Universal Dynamic Production Sequencing (All 6 Permutations) ---");
  {
    const middleStages = ["stitching", "printing", "embroidering"];
    const permutations = [
      ["stitching", "printing", "embroidering"],
      ["stitching", "embroidering", "printing"],
      ["printing", "stitching", "embroidering"],
      ["printing", "embroidering", "stitching"],
      ["embroidering", "stitching", "printing"],
      ["embroidering", "printing", "stitching"],
    ];

    for (const [stg1, stg2, stg3] of permutations) {
      const permWfs: OrderWorkflowStage[] = [
        { id: "1", order_id: orderId, stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
        { id: "2", order_id: orderId, stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
        { id: "3", order_id: orderId, stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
        { id: "4", order_id: orderId, stage_key: stg1 as any, sequence_order: 4, status: "in_progress", started_at: null, completed_at: null },
        { id: "5", order_id: orderId, stage_key: stg2 as any, sequence_order: 5, status: "pending", started_at: null, completed_at: null },
        { id: "6", order_id: orderId, stage_key: stg3 as any, sequence_order: 6, status: "pending", started_at: null, completed_at: null },
        { id: "7", order_id: orderId, stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
        { id: "8", order_id: orderId, stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
      ];

      const prev1 = getPreviousStage(stg1, permWfs);
      const prev2 = getPreviousStage(stg2, permWfs);
      const prev3 = getPreviousStage(stg3, permWfs);

      assert(prev1?.stage_key === "cutting", `Permutation [${stg1}, ${stg2}, ${stg3}]: stage 1 prev is cutting`);
      assert(prev2?.stage_key === stg1, `Permutation [${stg1}, ${stg2}, ${stg3}]: stage 2 prev is ${stg1}`);
      assert(prev3?.stage_key === stg2, `Permutation [${stg1}, ${stg2}, ${stg3}]: stage 3 prev is ${stg2}`);
      assert(getNextStage(stg3, permWfs)?.stage_key === "checking", `Permutation [${stg1}, ${stg2}, ${stg3}]: stage 3 next is checking`);
    }
  }

  // ---------------------------------------------------------------------------------
  // TEST 12: Order, Style, Color, Size isolation
  // ---------------------------------------------------------------------------------
  console.log("\n--- TEST 12: Order, Style, Color, Size Isolation ---");
  {
    const cuttingItems: StoredCuttingItem[] = [
      { order_id: orderId, item_name: "Shirt", style_name: "Style A", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 2 },
      { order_id: orderId, item_name: "Shirt", style_name: "Style B", color: "Blue", size: "28", required_quantity: 1, cut_quantity: 3 },
      { order_id: orderId, item_name: "Shirt", style_name: "Style A", color: "Red", size: "28", required_quantity: 1, cut_quantity: 4 },
      { order_id: orderId, item_name: "Shirt", style_name: "Style A", color: "Blue", size: "30", required_quantity: 1, cut_quantity: 5 },
    ];

    const result = calculateDynamicStage({
      stageKey: "printing",
      workflows: baseWorkflows,
      cuttingItems,
      stageItems: [],
    });

    assert(result.groups.length === 3, "3 distinct groups formed (Style A/Blue, Style B/Blue, Style A/Red)");
    assert(result.totalInputPieces === 14, "Total input pieces is 2 + 3 + 4 + 5 = 14");
    assert(result.totalRequiredSizesCount === 4, "4 distinct size rows");
  }

  console.log("\n==================================================================");
  console.log("ALL TEST CASES PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runTestSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
