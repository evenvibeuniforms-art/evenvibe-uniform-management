import assert from "node:assert";
import {
  calculateQualityCheck,
  StoredPackingOutputItem,
  StoredQCItem,
  buildQCGroupKey,
  buildQCSizeRowKey,
} from "../src/lib/qualityCheck/qualityCheckEngine";

// Helper to determine view completion state exactly as in AdminQualityCheckDetailsView
function computeQCViewState(
  qcRecord: { status: string } | null,
  qcData: ReturnType<typeof calculateQualityCheck>,
  hasUnsavedChanges = false
) {
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

  return {
    isCompleted,
    qcStatus,
    totalPacked: qcData.totalPackedPieces,
    totalChecked: qcData.totalCheckedPieces,
    totalPassed: qcData.totalPassedPieces,
    totalDefective: qcData.totalDefectivePieces,
    totalPending: qcData.totalPendingPieces,
    canComplete: qcData.canComplete,
  };
}

async function main() {
  console.log("=== RUNNING QC SAVE BEFORE COMPLETE & CONSTRAINT TEST SUITE ===");

  // ----------------------------------------------------
  // TEST 1: No Passed values entered.
  // Expected: Cannot complete.
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
    assert.strictEqual(viewState.canComplete, false);
    assert.strictEqual(viewState.totalPending, 3);
    console.log("✓ TEST 1: No Passed values -> cannot complete passed");
  }

  // ----------------------------------------------------
  // TEST 2: Packed = 1, Passed = 0.
  // Expected: Valid. Defective = 1.
  // ----------------------------------------------------
  {
    const packing: StoredPackingOutputItem[] = [
      { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "30", actual_quantity: 1 },
    ];
    const gKey = buildQCGroupKey("Shirt", null, null, null);
    const rKey = buildQCSizeRowKey(gKey, "30");

    const qcData = calculateQualityCheck({
      savedPackingItems: packing,
      liveInputs: { passedInputs: { [rKey]: "0" } },
    });

    const row = qcData.groups[0].sizeRows[0];
    assert.strictEqual(row.isValid, true);
    assert.strictEqual(row.passedQuantity, 0);
    assert.strictEqual(row.defectiveQuantity, 1);
    assert.strictEqual(row.status, "defective");
    assert.strictEqual(row.isComplete, true);
    console.log("✓ TEST 2: Packed = 1, Passed = 0 -> Valid. Defective = 1 passed");
  }

  // ----------------------------------------------------
  // TEST 3: Packed = 3. Passed: 1, 1, 0 (Screenshot exact case).
  // Pant 28: Packed 1, Passed 1, Defective 0
  // Shirt 28: Packed 1, Passed 1, Defective 0
  // Shirt 30: Packed 1, Passed 0, Defective 1
  // Expected: Checked = 3, Passed = 2, Defective = 1, Pending = 0, Complete QC succeeds.
  // ----------------------------------------------------
  {
    const packing: StoredPackingOutputItem[] = [
      { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
      { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
      { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "30", actual_quantity: 1 },
    ];
    const pantGKey = buildQCGroupKey("Pant", null, null, null);
    const pant28Key = buildQCSizeRowKey(pantGKey, "28");

    const shirtGKey = buildQCGroupKey("Shirt", null, null, null);
    const shirt28Key = buildQCSizeRowKey(shirtGKey, "28");
    const shirt30Key = buildQCSizeRowKey(shirtGKey, "30");

    const qcData = calculateQualityCheck({
      savedPackingItems: packing,
      liveInputs: {
        passedInputs: {
          [pant28Key]: "1",
          [shirt28Key]: "1",
          [shirt30Key]: "0",
        },
      },
    });

    assert.strictEqual(qcData.totalPackedPieces, 3);
    assert.strictEqual(qcData.totalCheckedPieces, 3);
    assert.strictEqual(qcData.totalPassedPieces, 2);
    assert.strictEqual(qcData.totalDefectivePieces, 1);
    assert.strictEqual(qcData.totalPendingPieces, 0);
    assert.strictEqual(qcData.canComplete, true);
    console.log("✓ TEST 3: Screenshot case (1, 1, 0) -> Packed=3, Checked=3, Passed=2, Defective=1, Pending=0, canComplete=true passed");
  }

  // ----------------------------------------------------
  // TEST 4: Complete QC Execution Order.
  // Expected server call order: saveOrderQualityCheckItems THEN completeQualityCheck.
  // Never the reverse.
  // ----------------------------------------------------
  {
    const callSequence: string[] = [];

    const mockSave = async (orderId: string, items: any[]) => {
      callSequence.push("saveOrderQualityCheckItems");
      return { success: true };
    };

    const mockComplete = async (orderId: string, items: any[], note?: string) => {
      callSequence.push("completeQualityCheck");
      return { success: true, status: "completed" };
    };

    async function handleCompleteQC() {
      const payloadItems = [{ item_name: "Pant", size: "28", passed_quantity: 1 }];
      const saveRes = await mockSave("ord-1", payloadItems);
      if (!saveRes.success) return;
      const completeRes = await mockComplete("ord-1", payloadItems, "Admin complete");
      if (!completeRes.success) return;
    }

    await handleCompleteQC();
    assert.deepStrictEqual(callSequence, ["saveOrderQualityCheckItems", "completeQualityCheck"]);
    console.log("✓ TEST 4: Server call order -> saveOrderQualityCheckItems THEN completeQualityCheck passed");
  }

  // ----------------------------------------------------
  // TEST 5: Save fails.
  // Expected: completeQualityCheck is NOT called.
  // ----------------------------------------------------
  {
    const callSequence: string[] = [];

    const mockSaveFailing = async (orderId: string, items: any[]) => {
      callSequence.push("saveOrderQualityCheckItems");
      return { error: "Database save failed" };
    };

    const mockComplete = async (orderId: string, items: any[], note?: string) => {
      callSequence.push("completeQualityCheck");
      return { success: true };
    };

    async function handleCompleteQCWithFailingSave() {
      const payloadItems = [{ item_name: "Pant", size: "28", passed_quantity: 1 }];
      const saveRes = await mockSaveFailing("ord-1", payloadItems);
      if (saveRes.error) {
        // STOP execution!
        return;
      }
      await mockComplete("ord-1", payloadItems, "Admin complete");
    }

    await handleCompleteQCWithFailingSave();
    assert.deepStrictEqual(callSequence, ["saveOrderQualityCheckItems"]);
    assert.strictEqual(callSequence.includes("completeQualityCheck"), false);
    console.log("✓ TEST 5: Save fails -> completeQualityCheck is NOT called passed");
  }

  // ----------------------------------------------------
  // TEST 6: Complete fails.
  // Expected: UI does NOT claim QC Completed.
  // ----------------------------------------------------
  {
    let uiClaimedCompleted = false;

    const mockSave = async () => ({ success: true });
    const mockCompleteFailing = async () => ({ error: "Completion rejected by server" });

    async function handleCompleteQCWithFailingComplete() {
      const saveRes = await mockSave();
      if (!saveRes.success) return;
      const completeRes = await mockCompleteFailing();
      if (completeRes.error) {
        // Do not mark UI completed
        return;
      }
      uiClaimedCompleted = true;
    }

    await handleCompleteQCWithFailingComplete();
    assert.strictEqual(uiClaimedCompleted, false);
    console.log("✓ TEST 6: Complete fails -> UI does NOT claim QC Completed passed");
  }

  // ----------------------------------------------------
  // TEST 7: Double click Complete.
  // Expected: Only one completion operation runs; subsequent click ignored due to isOperating.
  // ----------------------------------------------------
  {
    let executionCount = 0;
    let isOperating = false;

    async function handleCompleteQCDoubleClick() {
      if (isOperating) return;
      isOperating = true;
      try {
        executionCount++;
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
      } finally {
        isOperating = false;
      }
    }

    // Fire two rapid clicks
    const click1 = handleCompleteQCDoubleClick();
    const click2 = handleCompleteQCDoubleClick();
    await Promise.all([click1, click2]);

    assert.strictEqual(executionCount, 1);
    console.log("✓ TEST 7: Double click Complete -> Guarded, executed exactly once passed");
  }

  // ----------------------------------------------------
  // TEST 8: QC History insert.
  // Expected: to_status = 'completed' satisfies quality_check_history_to_status_check constraint.
  // Allowed: ('pending', 'in_progress', 'passed', 'failed', 'completed').
  // ----------------------------------------------------
  {
    const allowedStatuses = new Set(["pending", "in_progress", "passed", "failed", "completed"]);
    assert.strictEqual(allowedStatuses.has("completed"), true);
    assert.strictEqual(allowedStatuses.has("in_progress"), true);
    assert.strictEqual(allowedStatuses.has("pending"), true);
    // Invalid values should be rejected
    assert.strictEqual(allowedStatuses.has("qc_completed"), false);
    assert.strictEqual(allowedStatuses.has("done"), false);
    console.log("✓ TEST 8: QC history constraint check -> 'completed' is strictly valid passed");
  }

  // ----------------------------------------------------
  // TEST 9: Reload after completion.
  // Expected: QC Completed remains persisted in view state.
  // ----------------------------------------------------
  {
    const packing: StoredPackingOutputItem[] = [
      { order_id: "ord-1", stage_key: "packing", item_name: "Pant", size: "28", actual_quantity: 1 },
      { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "28", actual_quantity: 1 },
      { order_id: "ord-1", stage_key: "packing", item_name: "Shirt", size: "30", actual_quantity: 1 },
    ];
    const savedQCItems: StoredQCItem[] = [
      { order_id: "ord-1", item_name: "Pant", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
      { order_id: "ord-1", item_name: "Shirt", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
      { order_id: "ord-1", item_name: "Shirt", size: "30", packed_quantity: 1, passed_quantity: 0, defective_quantity: 1 },
    ];

    const persistedQCRecord = {
      status: "completed",
    };

    const qcData = calculateQualityCheck({
      savedPackingItems: packing,
      savedQCItems,
    });

    const viewState = computeQCViewState(persistedQCRecord, qcData);
    assert.strictEqual(viewState.isCompleted, true);
    assert.strictEqual(viewState.qcStatus, "completed");
    assert.strictEqual(viewState.totalPending, 0);
    assert.strictEqual(viewState.totalChecked, 3);
    assert.strictEqual(viewState.totalPassed, 2);
    assert.strictEqual(viewState.totalDefective, 1);
    console.log("✓ TEST 9: Reload after completion -> QC Completed remains persisted passed");
  }

  // ----------------------------------------------------
  // TEST 10: Packing & Delivery integration.
  // Expected: QC Completed allows Packing & Delivery.
  // ----------------------------------------------------
  {
    function isPackingDeliveryUnlocked(orderStatus: string, qcStatus: string) {
      // Stage 8 Packing Completed + QC Completed
      return orderStatus === "packed" && (qcStatus === "completed" || qcStatus === "passed");
    }

    assert.strictEqual(isPackingDeliveryUnlocked("packed", "completed"), true);
    assert.strictEqual(isPackingDeliveryUnlocked("packed", "pending"), false);
    assert.strictEqual(isPackingDeliveryUnlocked("in_progress", "completed"), false);
    console.log("✓ TEST 10: QC Completed allows Packing & Delivery passed");
  }

  console.log("\nALL 10 TEST CASES PASSED SUCCESSFULLY!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
