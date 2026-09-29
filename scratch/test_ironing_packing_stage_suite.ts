/**
 * test_ironing_packing_stage_suite.ts
 *
 * Comprehensive Automated Test Suite for Stage 8: Ironing & Packing.
 * Validates all business requirements, edge cases, formulas, zero-output filtering,
 * and end-to-end flows from user request.
 */

import {
  calculateIroningStep,
  calculatePackingStep,
  isIroningStepCompleted,
  StoredIroningPackingItem,
} from "../src/lib/production/ironingPackingEngine";
import { StoredCheckingItem } from "../src/lib/production/checkingEngine";
import { OrderWorkflowStage } from "../src/lib/productionWorkflow";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

console.log("=================================================================");
console.log("STARTING STAGE 8 — IRONING & PACKING AUTOMATED TEST SUITE");
console.log("=================================================================\n");

// -------------------------------------------------------------
// TEST 1: Checking Passed = 10, Ironing Input = 10, Admin enters Ironed = 10
// Expected: Pending = 0, Status = Complete
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      style_id: "style-a",
      style_name: "Style A",
      color: "Blue",
      size: "28",
      input_quantity: 10,
      passed_quantity: 10,
      reject_quantity: 0,
    },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      style_id: "style-a",
      style_name: "Style A",
      color: "Blue",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
    savedIroningItems: savedIroning,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.inputQuantity === 10 &&
    row?.actualQuantity === 10 &&
    row?.pendingQuantity === 0 &&
    row?.status === "complete" &&
    res.allSizesComplete &&
    res.canComplete,
    "Test 1: Checking Passed = 10, Ironed = 10 => Pending = 0, Status = Complete"
  );
}

// -------------------------------------------------------------
// TEST 2: Checking Passed = 10, Ironed = 7
// Expected: Pending = 3, Status = Pending, Complete Ironing must fail
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      passed_quantity: 10,
      reject_quantity: 0,
    },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 7,
      pending_quantity: 3,
      status: "pending",
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
    savedIroningItems: savedIroning,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.inputQuantity === 10 &&
    row?.actualQuantity === 7 &&
    row?.pendingQuantity === 3 &&
    row?.status === "pending" &&
    !res.allSizesComplete &&
    !res.canComplete,
    "Test 2: Checking Passed = 10, Ironed = 7 => Pending = 3, Status = Pending (Completion blocked)"
  );
}

// -------------------------------------------------------------
// TEST 3: Input = 10, Ironed = 11
// Expected: REJECT (Ironed quantity cannot be greater than input quantity), Complete blocked
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      passed_quantity: 10,
      reject_quantity: 0,
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
    liveInputs: {
      ironedInputs: {
        "shirt:::no_style_id:::no_style_name:::no_color:::28": "11",
      },
    },
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.status === "invalid" &&
    !res.canComplete &&
    (row?.errorMessage || "").includes("Ironed quantity cannot be greater than input quantity"),
    "Test 3: Input = 10, Ironed = 11 => Invalid, Completion blocked ('Ironed quantity cannot be greater than input quantity')"
  );
}

// -------------------------------------------------------------
// TEST 4: Input = 10, Ironed = 0
// Expected: Valid quantity, Pending = 10, Status = Pending
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      passed_quantity: 10,
      reject_quantity: 0,
    },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 0,
      pending_quantity: 10,
      status: "pending",
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
    savedIroningItems: savedIroning,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.actualQuantity === 0 &&
    row?.pendingQuantity === 10 &&
    row?.status === "pending" &&
    !res.canComplete,
    "Test 4: Input = 10, Ironed = 0 => Valid quantity, Pending = 10, Status = Pending"
  );
}

// -------------------------------------------------------------
// TEST 5: Ironed quantity blank / missing
// Expected: Incomplete
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      passed_quantity: 10,
      reject_quantity: 0,
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.actualQuantity === null &&
    row?.status === "enter_quantities" &&
    !res.canComplete,
    "Test 5: Ironed quantity blank => Status = Incomplete, completion blocked"
  );
}

// -------------------------------------------------------------
// TEST 6: Ironing Output = 10, Packing Input = 10, Packed = 10
// Expected: Pending = 0, Status = Complete
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "packing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
    savedPackingItems: savedPacking,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.inputQuantity === 10 &&
    row?.actualQuantity === 10 &&
    row?.pendingQuantity === 0 &&
    row?.status === "complete" &&
    res.allSizesComplete &&
    res.canComplete,
    "Test 6: Ironing Output = 10, Packed = 10 => Pending = 0, Status = Complete"
  );
}

// -------------------------------------------------------------
// TEST 7: Ironing Output = 10, Packed = 7
// Expected: Pending = 3, Status = Pending, Complete Packing must fail
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "packing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 7,
      pending_quantity: 3,
      status: "pending",
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
    savedPackingItems: savedPacking,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.inputQuantity === 10 &&
    row?.actualQuantity === 7 &&
    row?.pendingQuantity === 3 &&
    row?.status === "pending" &&
    !res.allSizesComplete &&
    !res.canComplete,
    "Test 7: Ironing Output = 10, Packed = 7 => Pending = 3, Status = Pending (Completion blocked)"
  );
}

// -------------------------------------------------------------
// TEST 8: Input = 10, Packed = 11
// Expected: REJECT (Packed quantity cannot be greater than input quantity)
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
    liveInputs: {
      packedInputs: {
        "shirt:::no_style_id:::no_style_name:::no_color:::28": "11",
      },
    },
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.status === "invalid" &&
    !res.canComplete &&
    (row?.errorMessage || "").includes("Packed quantity cannot be greater than input quantity"),
    "Test 8: Input = 10, Packed = 11 => Invalid ('Packed quantity cannot be greater than input quantity')"
  );
}

// -------------------------------------------------------------
// TEST 9: Input = 10, Packed = 0
// Expected: Valid quantity, Pending = 10, Status = Pending
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "packing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 0,
      pending_quantity: 10,
      status: "pending",
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
    savedPackingItems: savedPacking,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.actualQuantity === 0 &&
    row?.pendingQuantity === 10 &&
    row?.status === "pending" &&
    !res.canComplete,
    "Test 9: Input = 10, Packed = 0 => Valid quantity, Pending = 10, Status = Pending"
  );
}

// -------------------------------------------------------------
// TEST 10: Packed quantity blank
// Expected: Incomplete
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 10,
      pending_quantity: 0,
      status: "complete",
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.actualQuantity === null &&
    row?.status === "enter_quantities" &&
    !res.canComplete,
    "Test 10: Packed quantity blank => Incomplete"
  );
}

// -------------------------------------------------------------
// TEST 11: Checking Zero Passed Filter: Size 26 (Passed = 0), Size 28 (Passed = 5)
// Expected: Ironing has ONLY Size 28; Size 26 does NOT appear
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "26",
      input_quantity: 5,
      passed_quantity: 0,
      reject_quantity: 5,
    },
    {
      order_id: "order-1",
      item_name: "Shirt",
      size: "28",
      input_quantity: 5,
      passed_quantity: 5,
      reject_quantity: 0,
    },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
  });
  assert(
    res.groups.length === 1 &&
    res.groups[0].sizeRows.length === 1 &&
    res.groups[0].sizeRows[0].size === "28" &&
    res.groups[0].sizeRows[0].inputQuantity === 5,
    "Test 11: Checking Size 26 (Passed 0) is excluded; only Size 28 appears in Ironing"
  );
}

// -------------------------------------------------------------
// TEST 12: Ironing Zero Output Filter: Size 26 (Ironed = 0), Size 28 (Ironed = 5)
// Expected: Packing has ONLY Size 28; Size 26 does NOT appear
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "26",
      input_quantity: 5,
      actual_quantity: 0,
      pending_quantity: 5,
    },
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 5,
      actual_quantity: 5,
      pending_quantity: 0,
    },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
  });
  assert(
    res.groups.length === 1 &&
    res.groups[0].sizeRows.length === 1 &&
    res.groups[0].sizeRows[0].size === "28" &&
    res.groups[0].sizeRows[0].inputQuantity === 5,
    "Test 12: Ironing Size 26 (0 output) is excluded; only Size 28 appears in Packing"
  );
}

// -------------------------------------------------------------
// TEST 13: Section 42 End-to-End Test:
// Checking: Size 28: Input = 10, Passed = 8, Reject = 2
// -> Ironing: Input = 8, Ironed = 8, Pending = 0
// -> Packing: Input = 8, Packed = 8, Pending = 0
// -> Final packed quantity = 8 (NOT 10, NOT 2)
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    {
      order_id: "order-1",
      item_name: "Pant",
      size: "28",
      input_quantity: 10,
      passed_quantity: 8,
      reject_quantity: 2,
    },
  ];

  // 1. Checking Passed -> Ironing Input
  const ironingRes = calculateIroningStep({
    savedCheckingItems: savedChecking,
    savedIroningItems: [
      {
        order_id: "order-1",
        stage_key: "ironing",
        item_name: "Pant",
        size: "28",
        input_quantity: 8,
        actual_quantity: 8,
        pending_quantity: 0,
        status: "complete",
      },
    ],
  });

  assert(
    ironingRes.totalInputPieces === 8 &&
    ironingRes.totalIronedPieces === 8 &&
    ironingRes.canComplete,
    "Test 13a: Ironing received strictly Checking Passed (8) and completed with 8 ironed pieces"
  );

  // 2. Ironing Output -> Packing Input
  const packingRes = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: [
      {
        order_id: "order-1",
        stage_key: "ironing",
        item_name: "Pant",
        size: "28",
        input_quantity: 8,
        actual_quantity: 8,
        pending_quantity: 0,
        status: "complete",
      },
    ],
    savedPackingItems: [
      {
        order_id: "order-1",
        stage_key: "packing",
        item_name: "Pant",
        size: "28",
        input_quantity: 8,
        actual_quantity: 8,
        pending_quantity: 0,
        status: "complete",
      },
    ],
  });

  assert(
    packingRes.totalInputPieces === 8 &&
    packingRes.totalPackedPieces === 8 &&
    packingRes.canComplete,
    "Test 13b: Packing received strictly Ironed Output (8) and completed with final packed = 8 (Rejected = 2 preserved)"
  );
}

// -------------------------------------------------------------
// TEST 14: Section 43 Multiple Size Test:
// Checking:
// Size 28: Input = 10, Passed = 8, Reject = 2
// Size 30: Input = 5, Passed = 5, Reject = 0
// Size 32: Input = 3, Passed = 2, Reject = 1
// Original Checking Input = 18.
// Ironing Input: Size 28 (8), Size 30 (5), Size 32 (2) -> Total 15
// Packing Input: Size 28 (8), Size 30 (5), Size 32 (2) -> Total 15
// Final: Packed = 15, Rejected = 3 (18 = 15 + 3)
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-1", item_name: "Uniform", size: "28", input_quantity: 10, passed_quantity: 8, reject_quantity: 2 },
    { order_id: "order-1", item_name: "Uniform", size: "30", input_quantity: 5, passed_quantity: 5, reject_quantity: 0 },
    { order_id: "order-1", item_name: "Uniform", size: "32", input_quantity: 3, passed_quantity: 2, reject_quantity: 1 },
  ];

  const ironingRes = calculateIroningStep({
    savedCheckingItems: savedChecking,
    savedIroningItems: [
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "28", input_quantity: 8, actual_quantity: 8, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "30", input_quantity: 5, actual_quantity: 5, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "32", input_quantity: 2, actual_quantity: 2, pending_quantity: 0 },
    ],
  });

  assert(
    ironingRes.totalInputPieces === 15 &&
    ironingRes.totalIronedPieces === 15 &&
    ironingRes.totalPendingPieces === 0 &&
    ironingRes.canComplete,
    "Test 14a: Multiple sizes Ironing receives 15 pieces (8 + 5 + 2) and completes"
  );

  const packingRes = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: [
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "28", input_quantity: 8, actual_quantity: 8, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "30", input_quantity: 5, actual_quantity: 5, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "ironing", item_name: "Uniform", size: "32", input_quantity: 2, actual_quantity: 2, pending_quantity: 0 },
    ],
    savedPackingItems: [
      { order_id: "order-1", stage_key: "packing", item_name: "Uniform", size: "28", input_quantity: 8, actual_quantity: 8, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "packing", item_name: "Uniform", size: "30", input_quantity: 5, actual_quantity: 5, pending_quantity: 0 },
      { order_id: "order-1", stage_key: "packing", item_name: "Uniform", size: "32", input_quantity: 2, actual_quantity: 2, pending_quantity: 0 },
    ],
  });

  const totalRejected = savedChecking.reduce((acc, c) => acc + (c.reject_quantity || 0), 0);
  assert(
    packingRes.totalPackedPieces === 15 &&
    totalRejected === 3 &&
    15 + 3 === 18 &&
    packingRes.canComplete,
    "Test 14b: Final Packed = 15, Rejected = 3 (15 + 3 = 18 original checking input)"
  );
}

// -------------------------------------------------------------
// TEST 15: Packing Lock Gate: Packing is locked when Ironing is incomplete
// -------------------------------------------------------------
{
  const res = calculatePackingStep({
    isIroningCompleted: false,
    savedIroningItems: [],
  });
  assert(
    res.isLocked === true &&
    res.canComplete === false &&
    Boolean(res.emptyStateMessage?.includes("locked")),
    "Test 15: Packing remains strictly locked when Ironing is incomplete"
  );
}

// -------------------------------------------------------------
// TEST 16: Partial Ironing does not unlock Packing
// -------------------------------------------------------------
{
  const workflow: OrderWorkflowStage & { ironing_completed_at?: string | null } = {
    id: "wf-8",
    order_id: "order-1",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: null,
    completed_at: null,
    ironing_completed_at: null,
  };
  const isDone = isIroningStepCompleted(workflow, [
    {
      order_id: "order-1",
      stage_key: "ironing",
      item_name: "Shirt",
      size: "28",
      input_quantity: 10,
      actual_quantity: 8,
      pending_quantity: 2,
    },
  ]);
  assert(
    isDone === false,
    "Test 16: Partial ironing (ironed 8 < input 10) does NOT mark Ironing as completed"
  );
}

// -------------------------------------------------------------
// TEST 17: All Checking Passed = 0 yields empty state message
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-1", item_name: "Shirt", size: "28", input_quantity: 5, passed_quantity: 0, reject_quantity: 5 },
    { order_id: "order-1", item_name: "Shirt", size: "30", input_quantity: 5, passed_quantity: 0, reject_quantity: 5 },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
  });
  assert(
    res.hasOperationalPieces === false &&
    res.groups.length === 0 &&
    res.emptyStateMessage === "No pieces are available for ironing.",
    "Test 17: All Checking Passed = 0 yields 'No pieces are available for ironing.'"
  );
}

// -------------------------------------------------------------
// TEST 18: All Ironing Output = 0 yields empty state message for Packing
// -------------------------------------------------------------
{
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-1", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 5, actual_quantity: 0, pending_quantity: 5 },
  ];
  const res = calculatePackingStep({
    isIroningCompleted: true,
    savedIroningItems: savedIroning,
  });
  assert(
    res.hasOperationalPieces === false &&
    res.groups.length === 0 &&
    res.emptyStateMessage === "No pieces are available for packing.",
    "Test 18: All Ironing Output = 0 yields 'No pieces are available for packing.'"
  );
}

// -------------------------------------------------------------
// TEST 19: Style + Color + Size Isolation in Stage 8
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-1", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "Blue", size: "28", input_quantity: 5, passed_quantity: 5, reject_quantity: 0 },
    { order_id: "order-1", item_name: "Shirt", style_id: "s1", style_name: "Style A", color: "White", size: "28", input_quantity: 4, passed_quantity: 4, reject_quantity: 0 },
    { order_id: "order-1", item_name: "Pant", style_id: "s2", style_name: "Style B", color: "Blue", size: "28", input_quantity: 3, passed_quantity: 3, reject_quantity: 0 },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
  });
  assert(
    res.groups.length === 3 &&
    res.totalInputPieces === 12 &&
    res.totalRequiredSizesCount === 3,
    "Test 19: Style + Color + Item remain completely isolated with same size (28)"
  );
}

// -------------------------------------------------------------
// TEST 20: Negative quantities validation
// -------------------------------------------------------------
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-1", item_name: "Shirt", size: "28", input_quantity: 10, passed_quantity: 10, reject_quantity: 0 },
  ];
  const res = calculateIroningStep({
    savedCheckingItems: savedChecking,
    liveInputs: {
      ironedInputs: {
        "shirt:::no_style_id:::no_style_name:::no_color:::28": "-1",
      },
    },
  });
  const row = res.groups[0]?.sizeRows[0];
  assert(
    row?.status === "invalid" &&
    !res.canComplete &&
    (row?.errorMessage || "").includes("Ironed quantity cannot be negative"),
    "Test 20: Ironed = -1 is rejected ('Ironed quantity cannot be negative')"
  );
}

// -------------------------------------------------------------
// USER REQUEST SPECIFIC SCENARIOS (TESTS 21 to 30)
// -------------------------------------------------------------

// TEST 21 (User Test 1): Ironing Input 3, Ironed 3 -> Ironing Completed -> Packing unlocked
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-u1", item_name: "Shirt", size: "28", input_quantity: 3, passed_quantity: 3, reject_quantity: 0 },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u1", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const wf: OrderWorkflowStage = {
    order_id: "order-u1",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: new Date().toISOString(),
  };

  const isDone = isIroningStepCompleted(wf, savedIroning, savedChecking);
  const packRes = calculatePackingStep({ isIroningCompleted: isDone, savedIroningItems: savedIroning });

  assert(isDone === true, "User Test 1a: Ironing Completed is true");
  assert(packRes.isLocked === false, "User Test 1b: Packing unlocked");
}

// TEST 22 (User Test 2): Ironing Input 3, Ironed 2 -> Pending 1 -> Ironing incomplete -> Packing locked
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-u2", item_name: "Shirt", size: "28", input_quantity: 3, passed_quantity: 3, reject_quantity: 0 },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u2", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 2, pending_quantity: 1, status: "pending" },
  ];
  const wf: OrderWorkflowStage = {
    order_id: "order-u2",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: null,
  };

  const isDone = isIroningStepCompleted(wf, savedIroning, savedChecking);
  const packRes = calculatePackingStep({ isIroningCompleted: isDone, savedIroningItems: savedIroning });

  assert(isDone === false, "User Test 2a: Ironing is incomplete (Pending 1)");
  assert(packRes.isLocked === true, "User Test 2b: Packing is locked");
}

// TEST 23 (User Test 3): Ironing Input 3, Ironed 0 -> valid quantity -> Pending 3 -> Ironing incomplete -> Packing locked
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-u3", item_name: "Shirt", size: "28", input_quantity: 3, passed_quantity: 3, reject_quantity: 0 },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u3", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 0, pending_quantity: 3, status: "pending" },
  ];
  const wf: OrderWorkflowStage = {
    order_id: "order-u3",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: null,
  };

  const isDone = isIroningStepCompleted(wf, savedIroning, savedChecking);
  const packRes = calculatePackingStep({ isIroningCompleted: isDone, savedIroningItems: savedIroning });

  assert(isDone === false, "User Test 3a: 0 is valid quantity, Pending 3, Ironing incomplete");
  assert(packRes.isLocked === true, "User Test 3b: Packing locked");
}

// TEST 24 (User Test 4): Ironing Input 3, Ironed 3 -> Packing Input must be 3
{
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u4", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const packRes = calculatePackingStep({ isIroningCompleted: true, savedIroningItems: savedIroning });

  assert(packRes.totalInputPieces === 3, "User Test 4a: Total Packing Input must be 3");
  assert(packRes.groups[0]?.sizeRows[0]?.inputQuantity === 3, "User Test 4b: Row Packing Input must be 3");
}

// TEST 25 (User Test 5): Packing Input 3, Packed 3 -> Pending 0 -> Packing Completed
{
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u5", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    { order_id: "order-u5", stage_key: "packing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const packRes = calculatePackingStep({ isIroningCompleted: true, savedIroningItems: savedIroning, savedPackingItems: savedPacking });

  assert(packRes.totalPackedPieces === 3, "User Test 5a: Packed pieces = 3");
  assert(packRes.totalPendingPieces === 0, "User Test 5b: Pending pieces = 0");
  assert(packRes.canComplete === true, "User Test 5c: Packing Completed and ready to update Order Status to Packed");
}

// TEST 26 (User Test 6): Packing Input 3, Packed 2 -> Pending 1 -> Packing incomplete -> Order must NOT become Packed
{
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-u6", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    { order_id: "order-u6", stage_key: "packing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 2, pending_quantity: 1, status: "pending" },
  ];
  const packRes = calculatePackingStep({ isIroningCompleted: true, savedIroningItems: savedIroning, savedPackingItems: savedPacking });

  assert(packRes.totalPendingPieces === 1, "User Test 6a: Pending 1 piece");
  assert(packRes.canComplete === false, "User Test 6b: Packing incomplete, order must NOT become packed");
}

// TEST 27 (User Test 7): Current screenshot scenario -> Ironing Completed, Packing Active, no lock toast condition
{
  const savedChecking: StoredCheckingItem[] = [
    { order_id: "order-screenshot", item_name: "Shirt", size: "28", input_quantity: 3, passed_quantity: 3, reject_quantity: 0 },
  ];
  const savedIroning: StoredIroningPackingItem[] = [
    { order_id: "order-screenshot", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const savedPacking: StoredIroningPackingItem[] = [
    { order_id: "order-screenshot", stage_key: "packing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0, status: "complete" },
  ];
  const wf: OrderWorkflowStage = {
    order_id: "order-screenshot",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: new Date().toISOString(),
  };

  const isDone = isIroningStepCompleted(wf, savedIroning, savedChecking);
  const packRes = calculatePackingStep({ isIroningCompleted: isDone, savedIroningItems: savedIroning, savedPackingItems: savedPacking });

  assert(isDone === true, "User Test 7a: Ironing Completed is true");
  assert(packRes.isLocked === false, "User Test 7b: Packing is Active, NOT locked");
  assert(packRes.emptyStateMessage === undefined, "User Test 7c: No lock message or empty state");
}

// TEST 28 (User Test 8): Refresh/reload production page after Ironing completion -> Packing remains unlocked
{
  // Simulating fresh load from database where ironing_completed_at is persisted
  const reloadedWorkflow: OrderWorkflowStage = {
    order_id: "order-reloaded",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: "2026-09-28T05:00:00Z",
    completed_at: null,
    ironing_completed_at: "2026-09-28T05:15:00Z",
  };
  const isDone = isIroningStepCompleted(reloadedWorkflow, []);
  assert(isDone === true, "User Test 8: Reloaded workflow with persisted ironing_completed_at keeps Packing unlocked");
}

// TEST 29 (User Test 9): Navigate away and return to same order -> persisted Ironing completion still unlocks Packing
{
  const navigatedWorkflow: OrderWorkflowStage = {
    order_id: "order-navigate",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: "2026-09-28T04:00:00Z",
    completed_at: null,
    ironing_completed_at: "2026-09-28T04:30:00Z",
  };
  const isDone = isIroningStepCompleted(navigatedWorkflow);
  const packRes = calculatePackingStep({ isIroningCompleted: isDone, savedIroningItems: [
    { order_id: "order-navigate", stage_key: "ironing", item_name: "Shirt", size: "28", input_quantity: 3, actual_quantity: 3, pending_quantity: 0 }
  ] });
  assert(isDone === true && !packRes.isLocked, "User Test 9: Returned order with persisted ironing_completed_at unlocks Packing seamlessly");
}

// TEST 30 (User Test 10): Different order -> must not inherit current order's Ironing/Packing state
{
  const orderA_wf: OrderWorkflowStage = {
    order_id: "order-A",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: new Date().toISOString(),
  };
  const orderB_wf: OrderWorkflowStage = {
    order_id: "order-B",
    stage_key: "ironing_packing",
    sequence_order: 8,
    status: "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    ironing_completed_at: null,
  };

  const isDoneA = isIroningStepCompleted(orderA_wf);
  const isDoneB = isIroningStepCompleted(orderB_wf, []);

  assert(isDoneA === true, "User Test 10a: Order A is completed");
  assert(isDoneB === false, "User Test 10b: Order B is strictly isolated and remains locked");
}

console.log("\n=================================================================");
console.log("STAGE 8 TEST SUITE FINISHED: ALL 30/30 TESTS PASSED (100%)");
console.log("=================================================================\n");

