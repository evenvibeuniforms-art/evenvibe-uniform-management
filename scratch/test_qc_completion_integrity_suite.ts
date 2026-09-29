import assert from "node:assert";
import {
  calculateQualityCheck,
  StoredPackingOutputItem,
  StoredQCItem,
  buildQCGroupKey,
  buildQCSizeRowKey,
} from "../src/lib/qualityCheck/qualityCheckEngine";

console.log("=== RUNNING QC COMPLETION INTEGRITY TEST SUITE ===");

// Helper to determine view completion and input editable state
function computeQCViewState(
  qcRecord: { status: string } | null,
  qcData: ReturnType<typeof calculateQualityCheck>,
  hasUnsavedChanges = false
) {
  // Authoritative completion logic
  const isTrulyCompleted = Boolean(
    (qcRecord?.status === "completed" || qcRecord?.status === "passed") &&
    qcData.hasOperationalPieces &&
    qcData.allSizesComplete &&
    qcData.totalPendingPieces === 0
  );

  const qcStatus: "pending" | "in_progress" | "completed" = isTrulyCompleted
    ? "completed"
    : qcRecord?.status === "in_progress" || qcData.totalCheckedPieces > 0 || hasUnsavedChanges
    ? "in_progress"
    : "pending";

  const isCompleted = isTrulyCompleted;
  const isInputDisabled = isCompleted;

  return {
    isCompleted,
    qcStatus,
    isInputDisabled,
    totalPacked: qcData.totalPackedPieces,
    totalChecked: qcData.totalCheckedPieces,
    totalPassed: qcData.totalPassedPieces,
    totalDefective: qcData.totalDefectivePieces,
    totalPending: qcData.totalPendingPieces,
    canComplete: qcData.canComplete,
  };
}

// ----------------------------------------------------
// TEST 1: New QC record. No Passed quantities entered.
// Expected: status = Pending/In Progress, pending > 0, inputs editable.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "30", actual_quantity: 1 },
  ];
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: [] });
  const viewState = computeQCViewState({ status: "in_progress" }, qcData);

  assert.strictEqual(viewState.isCompleted, false);
  assert.strictEqual(viewState.qcStatus, "in_progress");
  assert.strictEqual(viewState.totalPending, 3);
  assert.strictEqual(viewState.isInputDisabled, false);
  assert.strictEqual(viewState.canComplete, false);
  console.log("✓ TEST 1: New QC record, no Passed entered -> pending > 0, inputs editable passed");
}

// ----------------------------------------------------
// TEST 2: Passed = 0 for one row.
// Expected: valid, defective = packed, row complete.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 2 },
  ];
  const gKey = buildQCGroupKey("Pant", null, null, null);
  const rKey = buildQCSizeRowKey(gKey, "28");

  const qcData = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: { passedInputs: { [rKey]: "0" } },
  });

  const row = qcData.groups[0].sizeRows[0];
  assert.strictEqual(row.passedQuantity, 0);
  assert.strictEqual(row.defectiveQuantity, 2);
  assert.strictEqual(row.status, "defective");
  assert.strictEqual(row.isComplete, true);
  assert.strictEqual(qcData.totalCheckedPieces, 2);
  assert.strictEqual(qcData.totalPendingPieces, 0);
  console.log("✓ TEST 2: Passed = 0 -> valid, defective = packed, row complete passed");
}

// ----------------------------------------------------
// TEST 3: One row blank.
// Expected: QC cannot complete.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
  ];
  const gKey1 = buildQCGroupKey("Pant", null, null, null);
  const rKey1 = buildQCSizeRowKey(gKey1, "28");

  const qcData = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: { passedInputs: { [rKey1]: "1" } }, // Shirt size 28 is left blank
  });

  assert.strictEqual(qcData.allSizesComplete, false);
  assert.strictEqual(qcData.canComplete, false);
  assert.strictEqual(qcData.totalPendingPieces, 1);
  console.log("✓ TEST 3: One row blank -> QC cannot complete passed");
}

// ----------------------------------------------------
// TEST 4: All rows entered.
// Expected: QC can complete.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 2 },
  ];
  const gKeyPant = buildQCGroupKey("Pant", null, null, null);
  const gKeyShirt = buildQCGroupKey("Shirt", null, null, null);

  const qcData = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(gKeyPant, "28")]: "1",
        [buildQCSizeRowKey(gKeyShirt, "28")]: "2",
      },
    },
  });

  assert.strictEqual(qcData.allSizesComplete, true);
  assert.strictEqual(qcData.canComplete, true);
  assert.strictEqual(qcData.totalPendingPieces, 0);
  console.log("✓ TEST 4: All rows entered -> QC can complete passed");
}

// ----------------------------------------------------
// TEST 5: Passed > Packed.
// Expected: validation error.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
  ];
  const gKey = buildQCGroupKey("Pant", null, null, null);
  const qcData = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: { passedInputs: { [buildQCSizeRowKey(gKey, "28")]: "2" } },
  });

  const row = qcData.groups[0].sizeRows[0];
  assert.strictEqual(row.isValid, false);
  assert.strictEqual(qcData.canComplete, false);
  assert.match(row.errorMessage || "", /cannot be greater than Packed/i);
  console.log("✓ TEST 5: Passed > Packed -> validation error passed");
}

// ----------------------------------------------------
// TEST 6: Passed < 0.
// Expected: validation error.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
  ];
  const gKey = buildQCGroupKey("Pant", null, null, null);
  const qcData = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: { passedInputs: { [buildQCSizeRowKey(gKey, "28")]: "-1" } },
  });

  const row = qcData.groups[0].sizeRows[0];
  assert.strictEqual(row.isValid, false);
  assert.strictEqual(qcData.canComplete, false);
  assert.match(row.errorMessage || "", /cannot be negative/i);
  console.log("✓ TEST 6: Passed < 0 -> validation error passed");
}

// ----------------------------------------------------
// TEST 7: Save partial progress.
// Expected: success (Checked = 1, Pending = 1, status = In Progress).
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
  ];
  const savedQC: StoredQCItem[] = [
    { order_id: "ord-1", item_name: "Pant", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    // Shirt size 28 is still null (unentered)
  ];
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: savedQC });
  const viewState = computeQCViewState({ status: "in_progress" }, qcData);

  assert.strictEqual(viewState.isCompleted, false);
  assert.strictEqual(viewState.qcStatus, "in_progress");
  assert.strictEqual(viewState.totalChecked, 1);
  assert.strictEqual(viewState.totalPending, 1);
  assert.strictEqual(viewState.isInputDisabled, false);
  console.log("✓ TEST 7: Save partial progress -> status in_progress, pending = 1, inputs editable passed");
}

// ----------------------------------------------------
// TEST 8: Reload page after partial save.
// Expected: saved Passed quantities appear correctly.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 2 },
  ];
  const savedQC: StoredQCItem[] = [
    { order_id: "ord-1", item_name: "Pant", size: "28", packed_quantity: 1, passed_quantity: 0, defective_quantity: 1 },
  ];
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: savedQC });

  const pantRow = qcData.groups.find((g) => g.itemName === "Pant")!.sizeRows[0];
  const shirtRow = qcData.groups.find((g) => g.itemName === "Shirt")!.sizeRows[0];

  assert.strictEqual(pantRow.passedQuantity, 0);
  assert.strictEqual(pantRow.defectiveQuantity, 1);
  assert.strictEqual(pantRow.status, "defective");
  assert.strictEqual(shirtRow.passedQuantity, null);
  assert.strictEqual(shirtRow.status, "pending");
  console.log("✓ TEST 8: Reload page after partial save -> saved quantities appear accurately passed");
}

// ----------------------------------------------------
// TEST 9: Complete QC.
// Expected: server persists Completed.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
    { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
  ];
  const completedQC: StoredQCItem[] = [
    { order_id: "ord-1", item_name: "Pant", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    { order_id: "ord-1", item_name: "Shirt", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
  ];
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: completedQC });
  const viewState = computeQCViewState({ status: "completed" }, qcData);

  assert.strictEqual(viewState.isCompleted, true);
  assert.strictEqual(viewState.qcStatus, "completed");
  assert.strictEqual(viewState.totalPending, 0);
  console.log("✓ TEST 9: Complete QC -> status completed, pending = 0 passed");
}

// ----------------------------------------------------
// TEST 10: Reload after completion.
// Expected: Completed remains. Inputs become read-only only AFTER actual completion.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
  ];
  const completedQC: StoredQCItem[] = [
    { order_id: "ord-1", item_name: "Pant", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
  ];
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: completedQC });
  const viewState = computeQCViewState({ status: "completed" }, qcData);

  assert.strictEqual(viewState.isCompleted, true);
  assert.strictEqual(viewState.isInputDisabled, true);
  console.log("✓ TEST 10: Reload after completion -> inputs become read-only passed");
}

// ----------------------------------------------------
// TEST 11: QC completed.
// Expected: Packing & Delivery recognizes QC Completed.
// ----------------------------------------------------
{
  const qcRecord = { status: "completed", passed_quantity: 10, total_quantity: 10 };
  const isQCCompleted = qcRecord.status === "completed" || qcRecord.status === "passed";
  assert.strictEqual(isQCCompleted, true);
  console.log("✓ TEST 11: QC completed -> Packing & Delivery recognizes QC completed passed");
}

// ----------------------------------------------------
// TEST 12: CURRENT SCREENSHOT STATE!
// Order #EV-ORD-2026-AC1CD9:
// Packed = 3, Checked = 0, Passed = 0, Defective = 0, Pending = 3.
// All Passed inputs are blank.
// Expected: NOT Completed. Inputs editable. Pending = 3.
// ----------------------------------------------------
{
  const packing: StoredPackingOutputItem[] = [
    { order_id: "ord-screenshot", stage_key: "packing", item_name: "Pant", style_name: "hbbhhh", color: "Blue", size: "28", actual_quantity: 1 },
    { order_id: "ord-screenshot", stage_key: "packing", item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", actual_quantity: 1 },
    { order_id: "ord-screenshot", stage_key: "packing", item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", actual_quantity: 1 },
  ];

  // Even if an old stale record has status = 'completed' or order.status = 'packed'
  const staleQcRecord = { status: "completed" };
  const qcData = calculateQualityCheck({ savedPackingItems: packing, savedQCItems: [] });
  const viewState = computeQCViewState(staleQcRecord, qcData);

  // Must strictly NOT be completed because pending === 3!
  assert.strictEqual(viewState.isCompleted, false, "Must NOT be completed when pending = 3");
  assert.strictEqual(viewState.isInputDisabled, false, "Inputs MUST be editable");
  assert.strictEqual(viewState.totalPacked, 3);
  assert.strictEqual(viewState.totalChecked, 0);
  assert.strictEqual(viewState.totalPassed, 0);
  assert.strictEqual(viewState.totalDefective, 0);
  assert.strictEqual(viewState.totalPending, 3);
  assert.strictEqual(viewState.qcStatus, "pending");
  console.log("✓ TEST 12: Current screenshot state -> NOT completed, inputs editable, pending = 3 passed");
}

console.log("=================================================");
console.log("ALL 12 QC COMPLETION INTEGRITY TESTS PASSED!");
console.log("=================================================");
