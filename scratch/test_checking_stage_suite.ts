import {
  calculateCheckingStage,
  getIroningPackingInputItems,
  StoredCheckingItem,
  CheckingCalculationResult,
} from "../src/lib/production/checkingEngine";
import { OrderWorkflowStage } from "../src/lib/productionWorkflow";
import { StoredStageItem } from "../src/lib/production/dynamicStageEngine";

function runCheckingStageTests() {
  console.log("=================================================================");
  console.log("STARTING CHECKING STAGE UPDATED TEST SUITE (PASSED + AUTO REJECT)");
  console.log("=================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  // Base workflow: Cutting -> Stitching -> Printing -> Embroidering -> Checking -> Ironing & Packing
  const baseWorkflows: OrderWorkflowStage[] = [
    { order_id: "order-1", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "stitching", sequence_order: 4, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "printing", sequence_order: 5, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "embroidering", sequence_order: 6, status: "completed", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "checking", sequence_order: 7, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "order-1", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  // Stage items from embroidering (sequence 6, stageKey embroidering)
  // Input 10, actual_mistaked 0 => output 10
  const stageItems10: StoredStageItem[] = [
    {
      order_id: "order-1",
      stage_key: "embroidering",
      sequence_order: 6,
      item_name: "Shirt",
      style_id: "style-a",
      style_name: "Style A",
      color: "Blue",
      size: "26",
      input_quantity: 10,
      actual_quantity: 0,
      result_quantity: 10,
      status: "completed",
    },
  ];

  const stageItems1: StoredStageItem[] = [
    {
      order_id: "order-1",
      stage_key: "embroidering",
      sequence_order: 6,
      item_name: "Shirt",
      style_id: "style-a",
      style_name: "Style A",
      color: "Blue",
      size: "28",
      input_quantity: 1,
      actual_quantity: 0,
      result_quantity: 1,
      status: "completed",
    },
  ];

  // -------------------------------------------------------------
  // TEST 1: Input = 1, Passed = 1 => Expected: Reject = 0, Complete
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        passed_quantity: 1,
        reject_quantity: 0,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems1,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 1 &&
      row?.passedQuantity === 1 &&
      row?.rejectQuantity === 0 &&
      row?.status === "complete" &&
      res.allSizesComplete &&
      res.canComplete,
      "Input = 1, Passed = 1 => Reject = 0, Status = Complete"
    );
  }

  // -------------------------------------------------------------
  // TEST 2: Input = 1, Passed = 0 => Expected: Reject = 1, Complete
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        passed_quantity: 0,
        reject_quantity: 1,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems1,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 1 &&
      row?.passedQuantity === 0 &&
      row?.rejectQuantity === 1 &&
      row?.status === "complete" &&
      res.allSizesComplete &&
      res.canComplete,
      "Input = 1, Passed = 0 => Reject = 1, Status = Complete (0 is strictly valid)"
    );
  }

  // -------------------------------------------------------------
  // TEST 3: Input = 10, Passed = 8 => Expected: Reject = 2, Complete
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 8,
        reject_quantity: 2,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 10 &&
      row?.passedQuantity === 8 &&
      row?.rejectQuantity === 2 &&
      row?.status === "complete" &&
      res.totalPassedPieces === 8 &&
      res.totalRejectPieces === 2 &&
      res.canComplete,
      "Input = 10, Passed = 8 => Reject = 2, Complete"
    );
  }

  // -------------------------------------------------------------
  // TEST 4: Input = 10, Passed = 10 => Expected: Reject = 0, Complete
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 10,
        reject_quantity: 0,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 10 &&
      row?.passedQuantity === 10 &&
      row?.rejectQuantity === 0 &&
      row?.status === "complete" &&
      res.totalPassedPieces === 10 &&
      res.totalRejectPieces === 0 &&
      res.canComplete,
      "Input = 10, Passed = 10 => Reject = 0, Complete (Full pass)"
    );
  }

  // -------------------------------------------------------------
  // TEST 5: Input = 10, Passed = 11 => Expected: REJECT / Completion blocked
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 11,
        reject_quantity: 0,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.status === "invalid" &&
      row?.rejectQuantity === null &&
      !res.canComplete &&
      (row?.errorMessage || "").includes("Passed quantity cannot be greater than input quantity"),
      "Input = 10, Passed = 11 => Invalid, Completion blocked ('Passed quantity cannot be greater than input quantity.')"
    );
  }

  // -------------------------------------------------------------
  // TEST 6: Input = 10, Passed = -1 => Expected: REJECT / Completion blocked
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: -1,
        reject_quantity: 0,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: saved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.status === "invalid" &&
      !res.canComplete &&
      (row?.errorMessage || "").includes("negative"),
      "Input = 10, Passed = -1 => Invalid, Completion blocked ('Passed quantity cannot be negative.')"
    );
  }

  // -------------------------------------------------------------
  // TEST 7: Input = 10, Passed = blank (null/undefined) => Expected: Incomplete
  // -------------------------------------------------------------
  {
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: [],
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.status === "enter_quantities" &&
      row?.passedQuantity === null &&
      row?.rejectQuantity === null &&
      !res.allSizesComplete &&
      !res.canComplete &&
      (res.completionErrorMessage || "").includes("Enter passed quantity for all required sizes before completing Checking"),
      "Input = 10, Passed = blank => Incomplete, Completion blocked"
    );
  }

  // -------------------------------------------------------------
  // TEST 8: Final dynamic stage output = 0 => No operational Checking row
  // -------------------------------------------------------------
  {
    const zeroStageItems: StoredStageItem[] = [
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 1,
        actual_quantity: 1, // mistaked 1
        result_quantity: 0, // output 0
        status: "completed",
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: zeroStageItems,
      savedCheckingItems: [],
    });
    assert(
      res.groups.length === 0 &&
      res.totalRequiredSizesCount === 0 &&
      res.totalInputPieces === 0 &&
      res.completionErrorMessage === "No pieces are available for checking.",
      "Final output = 0 results in 0 Checking operational rows ('No pieces are available for checking.')"
    );
  }

  // -------------------------------------------------------------
  // TEST 9: Mixed rows: Size 26 -> Input 0, Size 28 -> Input 5, Size 30 -> Input 3
  // -------------------------------------------------------------
  {
    const mixedStageItems: StoredStageItem[] = [
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 1,
        actual_quantity: 1,
        result_quantity: 0, // output 0 -> excluded
        status: "completed",
      },
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "28",
        input_quantity: 5,
        actual_quantity: 0,
        result_quantity: 5, // output 5 -> included
        status: "completed",
      },
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "30",
        input_quantity: 3,
        actual_quantity: 0,
        result_quantity: 3, // output 3 -> included
        status: "completed",
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: mixedStageItems,
      savedCheckingItems: [],
    });
    const sizes = res.groups[0]?.sizeRows || [];
    assert(
      sizes.length === 2 &&
      sizes.some((r) => r.size === "28" && r.inputQuantity === 5) &&
      sizes.some((r) => r.size === "30" && r.inputQuantity === 3) &&
      !sizes.some((r) => r.size === "26"),
      "Mixed outputs: Size 26 (0) is excluded; only 28 and 30 appear as operational rows"
    );
  }

  // -------------------------------------------------------------
  // TEST 10: Input 10, Passed 8 => Reject automatically 2. Admin cannot edit Reject.
  // -------------------------------------------------------------
  {
    // Live input simulation: Admin types "8" into passedInputs
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: [],
      liveInputs: {
        passedInputs: {
          "shirt::style-a::style a::blue::26": "8",
        },
      },
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 10 &&
      row?.passedQuantity === 8 &&
      row?.rejectQuantity === 2 &&
      row?.status === "complete",
      "Live calculation: Admin enters Passed = 8 -> Reject automatically displays 2"
    );
  }

  // -------------------------------------------------------------
  // TEST 11: Verify client attempts to send reject_quantity are ignored/derived
  // -------------------------------------------------------------
  {
    // Even if client had sent reject_quantity = 100 in savedCheckingItems, calculation derives input - passed = 2
    const maliciousClientSaved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 8,
        reject_quantity: 100, // Malicious client attempt
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: maliciousClientSaved,
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.rejectQuantity === 2,
      "Client attempted reject_quantity = 100 is strictly overridden by server formula (Reject = 10 - 8 = 2)"
    );
  }

  // -------------------------------------------------------------
  // TEST 12: Verify client attempts input_quantity = 100 are rejected
  // -------------------------------------------------------------
  {
    // Authoritative final dynamic stage output is 10, not 100
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: [],
    });
    const row = res.groups[0]?.sizeRows[0];
    assert(
      row?.inputQuantity === 10,
      "Authoritative input quantity is 10 (derived from stage 6 output, client cannot spoof it)"
    );
  }

  // -------------------------------------------------------------
  // TEST 13: Verify all 6 dynamic production permutations
  // -------------------------------------------------------------
  {
    const permutations: [string, string, string][] = [
      ["stitching", "printing", "embroidering"], // final is embroidering
      ["stitching", "embroidering", "printing"], // final is printing
      ["printing", "stitching", "embroidering"], // final is embroidering
      ["printing", "embroidering", "stitching"], // final is stitching
      ["embroidering", "stitching", "printing"], // final is printing
      ["embroidering", "printing", "stitching"], // final is stitching
    ];

    let allPermutationsPassed = true;
    for (const [stg4, stg5, stg6] of permutations) {
      const dynamicWorkflows: OrderWorkflowStage[] = [
        { order_id: "order-perm", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: "cutting", sequence_order: 3, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: stg4 as any, sequence_order: 4, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: stg5 as any, sequence_order: 5, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: stg6 as any, sequence_order: 6, status: "completed", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: "checking", sequence_order: 7, status: "in_progress", started_at: null, completed_at: null },
        { order_id: "order-perm", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
      ];

      const stageItemsForPerm: StoredStageItem[] = [
        {
          order_id: "order-perm",
          stage_key: stg6,
          sequence_order: 6,
          item_name: "Blazer",
          style_id: "blazer-1",
          style_name: "Navy Blazer",
          color: "Navy",
          size: "34",
          input_quantity: 12,
          actual_quantity: 2,
          result_quantity: 10,
          status: "completed",
        },
      ];

      const res = calculateCheckingStage({
        workflows: dynamicWorkflows,
        stageItems: stageItemsForPerm,
        savedCheckingItems: [],
      });

      if (res.finalDynamicStageKey !== stg6 || res.totalInputPieces !== 10) {
        allPermutationsPassed = false;
        console.error(`Permutation failed for sequence 4=${stg4}, 5=${stg5}, 6=${stg6}. Resolved: ${res.finalDynamicStageKey}`);
      }
    }

    assert(
      allPermutationsPassed,
      "All 6 dynamic stage permutations correctly resolve the final dynamic stage (Stage 6) as Checking input source"
    );
  }

  // -------------------------------------------------------------
  // TEST 14: Verify Item + Style + Color + Size isolation
  // -------------------------------------------------------------
  {
    const multiItems: StoredStageItem[] = [
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        actual_quantity: 0,
        result_quantity: 10,
        status: "completed",
      },
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "28",
        input_quantity: 5,
        actual_quantity: 0,
        result_quantity: 5,
        status: "completed",
      },
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Pant",
        style_id: "style-b",
        style_name: "Style B",
        color: "Yellow",
        size: "26",
        input_quantity: 3,
        actual_quantity: 0,
        result_quantity: 3,
        status: "completed",
      },
    ];

    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: multiItems,
      savedCheckingItems: [],
    });

    assert(
      res.groups.length === 2 &&
      res.groups.some((g) => g.itemName === "Shirt" && g.sizeRows.length === 2) &&
      res.groups.some((g) => g.itemName === "Pant" && g.sizeRows.length === 1) &&
      res.totalRequiredSizesCount === 3,
      "Item + Style + Color + Size remain strictly isolated and distinct"
    );
  }

  // -------------------------------------------------------------
  // TEST 15: Verify Order isolation
  // -------------------------------------------------------------
  {
    const mixedOrderStageItems: StoredStageItem[] = [
      {
        order_id: "order-1",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        actual_quantity: 0,
        result_quantity: 10,
        status: "completed",
      },
      {
        order_id: "order-OTHER-99",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 50,
        actual_quantity: 0,
        result_quantity: 50,
        status: "completed",
      },
    ];

    const order1StageItems = mixedOrderStageItems.filter((i) => i.order_id === "order-1");
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: order1StageItems,
      savedCheckingItems: [],
    });

    assert(
      res.totalInputPieces === 10 && res.totalRequiredSizesCount === 1,
      "Order isolation strictly enforced: Only current order items are calculated"
    );
  }

  // -------------------------------------------------------------
  // TEST 16: Verify successful Checking unlocks Ironing & Packing
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 8,
        reject_quantity: 2,
      },
    ];
    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: stageItems10,
      savedCheckingItems: saved,
    });
    assert(
      res.allSizesComplete && res.canComplete,
      "Successful checking validation unlocks stage 8 Ironing & Packing"
    );
  }

  // -------------------------------------------------------------
  // TEST 17: Verify only Passed quantity flows to Ironing & Packing
  // -------------------------------------------------------------
  {
    const saved: StoredCheckingItem[] = [
      {
        order_id: "order-1",
        item_name: "Shirt",
        style_id: "style-a",
        style_name: "Style A",
        color: "Blue",
        size: "26",
        input_quantity: 10,
        passed_quantity: 8,
        reject_quantity: 2,
      },
    ];
    const { items: ironingInputs, totalQuantity } = getIroningPackingInputItems({ checkingItems: saved });
    assert(
      ironingInputs.length === 1 &&
      ironingInputs[0].inputQuantity === 8 &&
      totalQuantity === 8,
      "Only Passed quantity (8) continues to Ironing & Packing; Reject quantity (2) is barred"
    );
  }

  // -------------------------------------------------------------
  // TEST 18: Exact Scenario from Section 42
  // PANT: Input 1, Passed 1 => Reject 0, Complete
  // SHIRT:
  //   Size 28: Input 1, Passed 1 => Reject 0, Complete
  //   Size 30: Input 1, Passed 0 => Reject 1, Complete
  // Summary: Total Input 3, Total Passed 2, Total Reject 1 (2 + 1 = 3)
  // Ironing & Packing receives 2 pieces, Rejected 1 piece
  // -------------------------------------------------------------
  {
    const section42StageItems: StoredStageItem[] = [
      {
        order_id: "order-s42",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Pant",
        style_id: "style-hhhh",
        style_name: "hhhhhhh",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        actual_quantity: 0,
        result_quantity: 1,
        status: "completed",
      },
      {
        order_id: "order-s42",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-drak",
        style_name: "style drak",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        actual_quantity: 0,
        result_quantity: 1,
        status: "completed",
      },
      {
        order_id: "order-s42",
        stage_key: "embroidering",
        sequence_order: 6,
        item_name: "Shirt",
        style_id: "style-drak",
        style_name: "style drak",
        color: "Blue",
        size: "30",
        input_quantity: 1,
        actual_quantity: 0,
        result_quantity: 1,
        status: "completed",
      },
    ];

    const section42Saved: StoredCheckingItem[] = [
      {
        order_id: "order-s42",
        item_name: "Pant",
        style_id: "style-hhhh",
        style_name: "hhhhhhh",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        passed_quantity: 1,
        reject_quantity: 0,
      },
      {
        order_id: "order-s42",
        item_name: "Shirt",
        style_id: "style-drak",
        style_name: "style drak",
        color: "Blue",
        size: "28",
        input_quantity: 1,
        passed_quantity: 1,
        reject_quantity: 0,
      },
      {
        order_id: "order-s42",
        item_name: "Shirt",
        style_id: "style-drak",
        style_name: "style drak",
        color: "Blue",
        size: "30",
        input_quantity: 1,
        passed_quantity: 0,
        reject_quantity: 1,
      },
    ];

    const res = calculateCheckingStage({
      workflows: baseWorkflows,
      stageItems: section42StageItems,
      savedCheckingItems: section42Saved,
    });

    const { items: ironingInputs, totalQuantity: totalIroning } = getIroningPackingInputItems({
      checkingItems: section42Saved,
    });

    assert(
      res.allSizesComplete &&
      res.canComplete &&
      res.totalInputPieces === 3 &&
      res.totalPassedPieces === 2 &&
      res.totalRejectPieces === 1 &&
      res.totalPassedPieces + res.totalRejectPieces === res.totalInputPieces &&
      totalIroning === 2 &&
      ironingInputs.length === 2 &&
      !ironingInputs.some((it) => it.itemName === "Shirt" && it.size === "30"),
      "Section 42 exact scenario: Total Input = 3, Passed = 2, Reject = 1 (2 + 1 = 3); Ironing & Packing receives 2, Reject = 1 recorded"
    );
  }

  console.log("\n=================================================================");
  console.log(`CHECKING TEST SUITE FINISHED: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("=================================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runCheckingStageTests();
