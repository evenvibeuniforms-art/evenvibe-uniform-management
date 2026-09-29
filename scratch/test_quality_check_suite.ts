import assert from "node:assert";
import {
  calculateQualityCheck,
  StoredPackingOutputItem,
  StoredQCItem,
  buildQCGroupKey,
  buildQCSizeRowKey,
} from "../src/lib/qualityCheck/qualityCheckEngine";

console.log("=== RUNNING QUALITY CHECK TEST SUITE ===");

// Helper to construct a standard packing item
function makePackingItem(
  orderId: string,
  itemName: string,
  styleName: string,
  color: string,
  size: string,
  actualQuantity: number
): StoredPackingOutputItem {
  return {
    order_id: orderId,
    stage_key: "packing",
    item_name: itemName,
    style_name: styleName,
    color: color,
    size: size,
    actual_quantity: actualQuantity,
  };
}

// ----------------------------------------------------
// TEST 1: Packed = 1, Passed = 1, Defective = 0 -> Status = Passed
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 1)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Pant", null, "Style A", "Blue"), "28")]: "1",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.packedQuantity, 1);
  assert.strictEqual(row.passedQuantity, 1);
  assert.strictEqual(row.defectiveQuantity, 0);
  assert.strictEqual(row.status, "passed");
  assert.strictEqual(row.isValid, true);
  console.log("✓ TEST 1: Packed = 1, Passed = 1, Defective = 0 -> Status = Passed passed");
}

// ----------------------------------------------------
// TEST 2: Packed = 1, Passed = 0, Defective = 1 -> Status = Defective
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 1)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Pant", null, "Style A", "Blue"), "28")]: "0",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.packedQuantity, 1);
  assert.strictEqual(row.passedQuantity, 0);
  assert.strictEqual(row.defectiveQuantity, 1);
  assert.strictEqual(row.status, "defective");
  assert.strictEqual(row.isValid, true);
  console.log("✓ TEST 2: Packed = 1, Passed = 0, Defective = 1 -> Status = Defective passed");
}

// ----------------------------------------------------
// TEST 3: Packed = 10, Passed = 8, Defective = 2 -> Status = Partial
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Shirt", "Style B", "White", "30", 10)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Shirt", null, "Style B", "White"), "30")]: "8",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.packedQuantity, 10);
  assert.strictEqual(row.passedQuantity, 8);
  assert.strictEqual(row.defectiveQuantity, 2);
  assert.strictEqual(row.status, "partial");
  assert.strictEqual(row.isValid, true);
  console.log("✓ TEST 3: Packed = 10, Passed = 8, Defective = 2 -> Status = Partial passed");
}

// ----------------------------------------------------
// TEST 4: Packed = 10, Passed = 10, Defective = 0 -> Complete (Passed)
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Shirt", "Style B", "White", "30", 10)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Shirt", null, "Style B", "White"), "30")]: "10",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.packedQuantity, 10);
  assert.strictEqual(row.passedQuantity, 10);
  assert.strictEqual(row.defectiveQuantity, 0);
  assert.strictEqual(row.status, "passed");
  assert.strictEqual(result.allSizesComplete, true);
  assert.strictEqual(result.canComplete, true);
  console.log("✓ TEST 4: Packed = 10, Passed = 10, Defective = 0 -> Complete passed");
}

// ----------------------------------------------------
// TEST 5: Packed = 10, Passed = 11 -> Reject (Passed > Packed)
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Shirt", "Style B", "White", "30", 10)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Shirt", null, "Style B", "White"), "30")]: "11",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.isValid, false);
  assert.strictEqual(row.status, "invalid");
  assert.strictEqual(result.canComplete, false);
  assert.match(row.errorMessage || "", /cannot be greater than Packed/i);
  console.log("✓ TEST 5: Packed = 10, Passed = 11 -> Reject passed");
}

// ----------------------------------------------------
// TEST 6: Packed = 10, Passed = -1 -> Reject (Passed < 0)
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Shirt", "Style B", "White", "30", 10)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Shirt", null, "Style B", "White"), "30")]: "-1",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.isValid, false);
  assert.strictEqual(row.status, "invalid");
  assert.strictEqual(result.canComplete, false);
  assert.match(row.errorMessage || "", /cannot be negative/i);
  console.log("✓ TEST 6: Packed = 10, Passed = -1 -> Reject passed");
}

// ----------------------------------------------------
// TEST 7: Passed = null / undefined -> Incomplete (Pending)
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 5)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {}, // empty: pending
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.passedQuantity, null);
  assert.strictEqual(row.status, "pending");
  assert.strictEqual(row.isComplete, false);
  assert.strictEqual(result.canComplete, false);
  assert.strictEqual(result.totalPendingPieces, 5);
  console.log("✓ TEST 7: Passed = null -> Incomplete passed");
}

// ----------------------------------------------------
// TEST 8: Passed = 0 -> Valid, NOT treated as missing
// ----------------------------------------------------
{
  const packing = [makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 3)];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Pant", null, "Style A", "Blue"), "28")]: "0",
      },
    },
  });

  const row = result.groups[0].sizeRows[0];
  assert.strictEqual(row.passedQuantity, 0);
  assert.strictEqual(row.isComplete, true);
  assert.strictEqual(row.status, "defective");
  assert.strictEqual(row.defectiveQuantity, 3);
  assert.strictEqual(result.allSizesComplete, true);
  assert.strictEqual(result.canComplete, true);
  console.log("✓ TEST 8: Passed = 0 -> Valid, NOT treated as missing passed");
}

// ----------------------------------------------------
// TEST 9: Final Packed Output = 0 -> Excluded from QC operational rows
// ----------------------------------------------------
{
  const packing = [
    makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 0), // packed 0
    makePackingItem("order-1", "Pant", "Style A", "Blue", "30", 5), // packed 5
  ];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
  });

  assert.strictEqual(result.groups.length, 1);
  assert.strictEqual(result.groups[0].sizeRows.length, 1);
  assert.strictEqual(result.groups[0].sizeRows[0].size, "30");
  assert.strictEqual(result.totalPackedPieces, 5);
  console.log("✓ TEST 9: Final Packed Output = 0 -> Excluded from QC passed");
}

// ----------------------------------------------------
// TEST 10: All rows completed -> QC can complete
// ----------------------------------------------------
{
  const packing = [
    makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 2),
    makePackingItem("order-1", "Shirt", "Style B", "White", "30", 3),
  ];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Pant", null, "Style A", "Blue"), "28")]: "2",
        [buildQCSizeRowKey(buildQCGroupKey("Shirt", null, "Style B", "White"), "30")]: "3",
      },
    },
  });

  assert.strictEqual(result.totalPackedPieces, 5);
  assert.strictEqual(result.totalCheckedPieces, 5);
  assert.strictEqual(result.totalPendingPieces, 0);
  assert.strictEqual(result.allSizesComplete, true);
  assert.strictEqual(result.canComplete, true);
  console.log("✓ TEST 10: All rows completed -> QC can complete passed");
}

// ----------------------------------------------------
// TEST 11: Any row missing Passed -> QC cannot complete
// ----------------------------------------------------
{
  const packing = [
    makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 2),
    makePackingItem("order-1", "Shirt", "Style B", "White", "30", 3),
  ];
  const result = calculateQualityCheck({
    savedPackingItems: packing,
    liveInputs: {
      passedInputs: {
        [buildQCSizeRowKey(buildQCGroupKey("Pant", null, "Style A", "Blue"), "28")]: "2",
        // Shirt size 30 is missing
      },
    },
  });

  assert.strictEqual(result.allSizesComplete, false);
  assert.strictEqual(result.canComplete, false);
  assert.strictEqual(result.totalPendingPieces, 3);
  console.log("✓ TEST 11: Any row missing Passed -> QC cannot complete passed");
}

// ----------------------------------------------------
// TEST 12: Current order data only (order isolation)
// ----------------------------------------------------
{
  const order1Packing = [makePackingItem("order-1", "Pant", "Style A", "Blue", "28", 4)];
  const order2Packing = [makePackingItem("order-2", "Pant", "Style A", "Blue", "28", 99)];

  const result1 = calculateQualityCheck({ savedPackingItems: order1Packing });
  assert.strictEqual(result1.totalPackedPieces, 4);

  const result2 = calculateQualityCheck({ savedPackingItems: order2Packing });
  assert.strictEqual(result2.totalPackedPieces, 99);
  console.log("✓ TEST 12: Current order data only passed");
}

// ----------------------------------------------------
// TEST 13: Example physical flow:
// Requirement 10 -> Cutting 12 -> Dynamic 11 -> Checking 10 -> Ironing 10 -> Packing 9
// QC Input must be 9
// ----------------------------------------------------
{
  // Given packing stage output item with actual_quantity = 9
  const packingItem = makePackingItem("order-1", "Shirt", "School Style", "Navy", "32", 9);
  const result = calculateQualityCheck({
    savedPackingItems: [packingItem],
  });

  assert.strictEqual(result.totalPackedPieces, 9);
  assert.strictEqual(result.groups[0].sizeRows[0].packedQuantity, 9);
  console.log("✓ TEST 13: Physical flow test (Packed 9 -> QC Input 9) passed");
}

console.log("========================================");
console.log("ALL 13 TESTS PASSED SUCCESSFULLY!");
console.log("========================================");
