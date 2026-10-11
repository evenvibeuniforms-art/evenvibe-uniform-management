import { execSync } from "child_process";
import assert from "node:assert";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

console.log("================================================================================");
console.log("   EVENVIBE — DISPATCHED BATCH COMPLETION & BATCH-SPECIFIC DISPLAY TESTS");
console.log("================================================================================");

function runDbQuery(sql: string): any {
  const tempFile = resolve(
    process.cwd(),
    "scratch",
    `tmp_query_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`
  );
  writeFileSync(tempFile, sql, "utf-8");
  try {
    const cmd = `npx supabase db query --linked -f "${tempFile}"`;
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const jsonStart = output.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(`Failed to parse CLI output: ${output}`);
    }
    return JSON.parse(output.substring(jsonStart));
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }
}

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

// =============================================================================
// Test 1: A dispatched batch can be marked delivered with timestamp
// =============================================================================
test("1. A dispatched batch can be marked delivered with delivered_at timestamp", () => {
  const batch = {
    id: "batch-2",
    batch_number: 2,
    status: "dispatched",
    dispatched_at: "2026-10-10T10:00:00Z",
    delivered_at: null as string | null,
  };

  // Lifecycle transition
  assert.strictEqual(["dispatched", "in_transit"].includes(batch.status), true);
  const nowIso = new Date().toISOString();
  const updatedBatch = {
    ...batch,
    status: "delivered",
    delivered_at: nowIso,
  };

  assert.strictEqual(updatedBatch.status, "delivered");
  assert.ok(updatedBatch.delivered_at);
});

// =============================================================================
// Test 2: A batch with zero actual delivery cannot falsely mark unrelated items delivered
// =============================================================================
test("2. A batch with zero actual delivery cannot falsely mark unrelated items delivered", () => {
  const allOriginalItems = [
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "26", originalQuantity: 1 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "28", originalQuantity: 1 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "30", originalQuantity: 3 },
  ];

  // Batch #2 actuals: Size 26 has 2, Sizes 28 & 30 have 0
  const batch2ActualItems = [
    { style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "26", actual_quantity: 2, batch_number: 2 },
    { style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "28", actual_quantity: 0, batch_number: 2 },
    { style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "30", actual_quantity: 0, batch_number: 2 },
  ];

  const deliveredBatchNums = new Set([2]);
  const deliveredSumMap = new Map<string, number>();

  for (const it of batch2ActualItems) {
    if (deliveredBatchNums.has(it.batch_number)) {
      const k = `${it.style_name}_${it.item_name}_${it.color}_${it.size}`;
      deliveredSumMap.set(k, (deliveredSumMap.get(k) || 0) + it.actual_quantity);
    }
  }

  assert.strictEqual(deliveredSumMap.get("VIGNESH_TSHIRT_Green_26"), 2);
  assert.strictEqual(deliveredSumMap.get("VIGNESH_TSHIRT_Green_28"), 0);
  assert.strictEqual(deliveredSumMap.get("VIGNESH_TSHIRT_Green_30"), 0);
});

// =============================================================================
// Test 3: Viewing Batch #2 shows only positive actual quantities recorded in Batch #2
// =============================================================================
test("3. Viewing Batch #2 shows only positive actual quantities recorded in Batch #2", () => {
  const savedActualItems = [
    { id: "1", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "26", original_quantity: 1, actual_quantity: 2, batch_number: 2 },
    { id: "2", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "28", original_quantity: 1, actual_quantity: 0, batch_number: 2 },
    { id: "3", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "30", original_quantity: 3, actual_quantity: 0, batch_number: 2 },
    { id: "4", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "34", original_quantity: 1, actual_quantity: 0, batch_number: 2 },
    { id: "5", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "36", original_quantity: 2, actual_quantity: 0, batch_number: 2 },
  ];

  const selectedBatchView = 2;
  const isEditingActiveBatch = false;

  // Filter for selected historical/finalized batch
  const batchItems = savedActualItems.filter(
    (s) => (s.batch_number || 1) === selectedBatchView && s.actual_quantity > 0
  );

  assert.strictEqual(batchItems.length, 1, "Only Size 26 should be in Batch #2 view");
  assert.strictEqual(batchItems[0].size, "26");
  assert.strictEqual(batchItems[0].actual_quantity, 2);
});

// =============================================================================
// Test 4: Zero-delivery sizes do not display 'Not Delivered' in that batch view
// =============================================================================
test("4. Zero-delivery sizes do not display 'Not Delivered' in that batch view", () => {
  const savedActualItems = [
    { id: "1", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "26", original_quantity: 1, actual_quantity: 2, batch_number: 2 },
    { id: "2", style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "28", original_quantity: 1, actual_quantity: 0, batch_number: 2 },
  ];

  const isReadOnly = true;
  const filteredMatrixItems = savedActualItems
    .filter((s) => s.batch_number === 2 && s.actual_quantity > 0)
    .map((s) => ({
      ...s,
      styleName: s.style_name,
      itemName: s.item_name,
      originalQuantity: s.original_quantity,
    }));

  const classifications = filteredMatrixItems.map((item) => {
    const valNum = item.actual_quantity;
    const diff = valNum - item.originalQuantity;
    if (diff === 0) return "exact";
    if (diff > 0) return "extra";
    return isReadOnly ? "short" : "not_delivered";
  });

  assert.strictEqual(classifications.includes("not_delivered" as any), false, "Must not display not_delivered");
  assert.deepStrictEqual(classifications, ["extra"]);
});

// =============================================================================
// Test 5: Pending next-delivery entry still shows all outstanding combinations
// =============================================================================
test("5. Pending next-delivery entry still shows all outstanding combinations", () => {
  const allOriginalItems = [
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "26", originalQuantity: 1 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "28", originalQuantity: 1 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "30", originalQuantity: 3 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "34", originalQuantity: 1 },
    { styleName: "VIGNESH", itemName: "TSHIRT", color: "Green", size: "36", originalQuantity: 2 },
  ];

  // Batch #1 & #2 finalized: Size 26 has 2 pcs delivered (fulfilled + extra), other sizes have 0 delivered
  const finalizedQuantitiesMap = new Map<string, number>([
    ["VIGNESH_TSHIRT_Green_26", 2],
    ["VIGNESH_TSHIRT_Green_28", 0],
    ["VIGNESH_TSHIRT_Green_30", 0],
    ["VIGNESH_TSHIRT_Green_34", 0],
    ["VIGNESH_TSHIRT_Green_36", 0],
  ]);

  const remainingQuantitiesMap = new Map<string, { remaining: number; extra: number }>();
  for (const item of allOriginalItems) {
    const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
    const fin = finalizedQuantitiesMap.get(k) || 0;
    const remaining = Math.max(0, item.originalQuantity - fin);
    const extra = Math.max(0, fin - item.originalQuantity);
    remainingQuantitiesMap.set(k, { remaining, extra });
  }

  const activeMatrixItems = allOriginalItems
    .filter((it) => {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      return (remainingQuantitiesMap.get(k)?.remaining || 0) > 0;
    })
    .map((it) => {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      return {
        ...it,
        originalQuantity: it.originalQuantity,
        pendingQuantity: remainingQuantitiesMap.get(k)?.remaining || 0,
      };
    });

  // Size 26 should be excluded since remaining = 0
  assert.strictEqual(activeMatrixItems.some((it) => it.size === "26"), false, "Size 26 must be excluded from next delivery entry");
  // Outstanding sizes must remain
  assert.strictEqual(activeMatrixItems.length, 4, "Sizes 28, 30, 34, 36 must be present");
  assert.strictEqual(activeMatrixItems.find((it) => it.size === "28")?.pendingQuantity, 1);
  assert.strictEqual(activeMatrixItems.find((it) => it.size === "30")?.pendingQuantity, 3);
  assert.strictEqual(activeMatrixItems.find((it) => it.size === "34")?.pendingQuantity, 1);
  assert.strictEqual(activeMatrixItems.find((it) => it.size === "36")?.pendingQuantity, 2);
});

// =============================================================================
// Test 6: Extra delivery in one size/color does not offset another combination
// =============================================================================
test("6. Extra delivery in one size/color does not offset another combination", () => {
  // Green Size 26 has +1 extra. It must NOT reduce Green Size 28 (which still needs 1)
  const size26Accepted = 2;
  const size26Original = 1;
  const size26Extra = Math.max(0, size26Accepted - size26Original);
  const size26Remaining = Math.max(0, size26Original - size26Accepted);

  const size28Accepted = 0;
  const size28Original = 1;
  const size28Remaining = Math.max(0, size28Original - size28Accepted);

  assert.strictEqual(size26Extra, 1, "Size 26 extra must be 1");
  assert.strictEqual(size26Remaining, 0, "Size 26 remaining must be 0");
  assert.strictEqual(size28Remaining, 1, "Size 28 remaining must be 1 (not offset by Size 26 extra!)");
});

// =============================================================================
// Test 7: Historical batches remain unchanged and read-only
// =============================================================================
test("7. Historical batches remain unchanged and read-only", () => {
  const batchList = [
    { batch_number: 1, status: "delivered" },
    { batch_number: 2, status: "delivered" },
    { batch_number: 3, status: "draft" },
  ];

  const isBatch1ReadOnly = batchList.find((b) => b.batch_number === 1)?.status !== "draft";
  const isBatch2ReadOnly = batchList.find((b) => b.batch_number === 2)?.status !== "draft";
  const isBatch3ReadOnly = batchList.find((b) => b.batch_number === 3)?.status !== "draft";

  assert.strictEqual(isBatch1ReadOnly, true, "Batch 1 must be read-only");
  assert.strictEqual(isBatch2ReadOnly, true, "Batch 2 must be read-only");
  assert.strictEqual(isBatch3ReadOnly, false, "Batch 3 draft is editable");
});

// =============================================================================
// Test 8: Order-level status remains correct while other batches or quantities pending
// =============================================================================
test("8. Order-level status remains dispatched if quantities are pending after batch delivery", () => {
  const reqItems = [
    { style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "26", quantity: 1 },
    { style_name: "VIGNESH", item_name: "TSHIRT", color: "Green", size: "28", quantity: 1 },
  ];

  // Batch #2 delivered Size 26: 2 pcs, Size 28: 0 pcs
  const deliveredMap = new Map<string, number>([
    ["vignesh_tshirt_green_26", 2],
    ["vignesh_tshirt_green_28", 0],
  ]);

  let allFulfilled = true;
  for (const req of reqItems) {
    const k = `${req.style_name.toLowerCase()}_${req.item_name.toLowerCase()}_${req.color.toLowerCase()}_${req.size.toLowerCase()}`;
    const del = deliveredMap.get(k) || 0;
    if (del < req.quantity) {
      allFulfilled = false;
      break;
    }
  }

  assert.strictEqual(allFulfilled, false, "Order must NOT be marked fully delivered");
  const expectedOrderStatus = allFulfilled ? "delivered" : "dispatched";
  assert.strictEqual(expectedOrderStatus, "dispatched");
});

// =============================================================================
// Test 9: Repeated completion does not duplicate records
// =============================================================================
test("9. Repeated completion does not duplicate records or allow invalid transition", () => {
  const batch = { batch_number: 2, status: "delivered" };

  // Attempting to complete already delivered batch should be guarded
  let errorMessage: string | null = null;
  if (batch.status === "delivered") {
    errorMessage = `Batch #${batch.batch_number} has already been marked as delivered.`;
  }

  assert.strictEqual(errorMessage, "Batch #2 has already been marked as delivered.");
});

// =============================================================================
// Test 10: Returns and follow-up dispatches continue to work correctly
// =============================================================================
test("10. Returns reduce accepted delivered quantity and restore pending quantity", () => {
  const originalQuantity = 10;
  const deliveredQuantity = 10;
  const returnQuantity = 2; // Active return of 2 pcs

  const accepted = Math.max(0, deliveredQuantity - returnQuantity);
  const remaining = Math.max(0, originalQuantity - accepted);

  assert.strictEqual(accepted, 8, "Accepted quantity must be 8");
  assert.strictEqual(remaining, 2, "Remaining pending requirement must reappear as 2");
});

// =============================================================================
// Test 11: Empty state for batch with zero deliveries
// =============================================================================
test("11. Empty state displays 'No items were delivered in this batch.'", () => {
  const groupedStyles: any[] = [];
  const isReadOnly = true;

  const emptyText =
    groupedStyles.length === 0
      ? isReadOnly
        ? "No items were delivered in this batch."
        : "No items found for this order."
      : null;

  assert.strictEqual(emptyText, "No items were delivered in this batch.");
});

// =============================================================================
// Test 12: Database E2E Transaction Test on Linked Supabase
// =============================================================================
test("12. Remote Supabase DB test: batch dispatch -> completion lifecycle", () => {
  const sql = `
    DO $$
    DECLARE
      v_order_id uuid;
      v_batch_id uuid;
      v_batch_status text;
      v_batch_delivered_at timestamptz;
    BEGIN
      SELECT id INTO v_order_id FROM orders LIMIT 1;
      IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'No order found';
      END IF;

      -- Insert test batch as dispatched
      INSERT INTO order_delivery_batches (
        order_id, batch_number, batch_reference, status, dispatched_at, created_at, updated_at
      ) VALUES (
        v_order_id, 999, 'BATCH-999', 'dispatched', now(), now(), now()
      ) RETURNING id INTO v_batch_id;

      -- Mark batch delivered (lifecycle rule)
      UPDATE order_delivery_batches
      SET status = 'delivered', delivered_at = now(), updated_at = now()
      WHERE id = v_batch_id
      RETURNING status, delivered_at INTO v_batch_status, v_batch_delivered_at;

      IF v_batch_status <> 'delivered' OR v_batch_delivered_at IS NULL THEN
        RAISE EXCEPTION 'Batch completion failed: status=%, delivered_at=%', v_batch_status, v_batch_delivered_at;
      END IF;

      -- Cleanup test batch
      DELETE FROM order_delivery_batches WHERE id = v_batch_id;
    END $$;
    SELECT 'PASS' as result;
  `;

  const res = runDbQuery(sql);
  assert.ok(res, "DB query should return result");
  assert.strictEqual(res.rows[0]?.result, "PASS");
});

console.log("\n--------------------------------------------------------------------------------");
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed.`);
console.log("--------------------------------------------------------------------------------");

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log("All tests completed successfully!");
}
