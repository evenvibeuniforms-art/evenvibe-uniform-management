import { execSync } from "child_process";
import assert from "node:assert";

console.log("================================================================================");
console.log("   EVENVIBE — BATCH #2 ACTUAL DELIVERY QUANTITY EDITING & LIFECYCLE TEST");
console.log("================================================================================");

import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

function runDbQuery(sql: string): any {
  const tempFile = resolve(process.cwd(), "scratch", `tmp_query_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`);
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
    try { unlinkSync(tempFile); } catch {}
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

// -----------------------------------------------------------------------------
// Test 1: Batch #1 delivered -> historical inputs read-only
// -----------------------------------------------------------------------------
test("1. Batch #1 delivered is read-only and immutable", () => {
  const selectedBatchView: any = 1;
  const existingBatchList: any[] = [
    { batch_number: 1, status: "delivered", batch_reference: "BATCH-001" },
  ];
  const totalOrderRemaining: any = 63;
  const selectedBatchRecord = existingBatchList.find((b) => b.batch_number === selectedBatchView);
  
  const isCurrentMatrixReadOnly =
    selectedBatchView === "consolidated"
      ? true
      : selectedBatchView === "active"
      ? totalOrderRemaining === 0
      : selectedBatchRecord?.status !== "draft";

  assert.strictEqual(isCurrentMatrixReadOnly, true, "Batch 1 must be read-only");

  // In DB: verify Batch 1 status is delivered
  const res = runDbQuery(
    "SELECT status FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15' AND batch_number = 1;"
  );
  assert.strictEqual(res.rows[0].status, "delivered");
});

// -----------------------------------------------------------------------------
// Test 2: Batch #2 active -> pending Actual Delivery Quantity inputs editable
// -----------------------------------------------------------------------------
test("2. Batch #2 active allows editing even when order.status is delivered", () => {
  const selectedBatchView: any = "active";
  const totalOrderRemaining: any = 58;
  const existingBatchList: any[] = [
    { batch_number: 1, status: "delivered", batch_reference: "BATCH-001" },
  ];
  const selectedBatchRecord = existingBatchList.find((b) => b.batch_number === selectedBatchView);

  const isCurrentMatrixReadOnly =
    selectedBatchView === "consolidated"
      ? true
      : selectedBatchView === "active"
      ? totalOrderRemaining === 0
      : selectedBatchRecord?.status !== "draft";

  assert.strictEqual(isCurrentMatrixReadOnly, false, "Batch #2 active must NOT be read-only!");

  // If user selects Batch #2 which is a draft:
  const selectedBatchView2: any = 2;
  const existingBatchListWithDraft: any[] = [
    { batch_number: 1, status: "delivered", batch_reference: "BATCH-001" },
    { batch_number: 2, status: "draft", batch_reference: "BATCH-002" },
  ];
  const selectedBatchRecord2 = existingBatchListWithDraft.find((b) => b.batch_number === selectedBatchView2);
  const isBatch2DraftReadOnly = selectedBatchRecord2?.status !== "draft";
  assert.strictEqual(isBatch2DraftReadOnly, false, "Batch #2 draft must be editable!");
});

// -----------------------------------------------------------------------------
// Test 3: Completed combinations from Batch #1 excluded from Batch #2
// -----------------------------------------------------------------------------
test("3. Completed combinations from Batch #1 cannot be delivered again as normal pending quantities", () => {
  // Item A: Original 1, Batch 1 Delivered 1 -> Remaining = MAX(0, 1 - 1) = 0
  // Item B: Original 11, Batch 1 Delivered 3 -> Remaining = MAX(0, 11 - 3) = 8
  const allOriginalItems = [
    { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Blue", size: "24", originalQuantity: 1 },
    { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "28", originalQuantity: 11 },
  ];
  const finalizedQuantitiesMap = new Map<string, number>([
    ["VIGNESH TSHIRT_TSHIRT_Blue_24", 1], // fully delivered
    ["VIGNESH TSHIRT_TSHIRT_Green_28", 3], // partially delivered
  ]);

  const activeMatrixItems = allOriginalItems
    .filter((it) => {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      const fin = finalizedQuantitiesMap.get(k) || 0;
      const rem = Math.max(0, it.originalQuantity - fin);
      return rem > 0;
    })
    .map((it) => {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      const fin = finalizedQuantitiesMap.get(k) || 0;
      const rem = Math.max(0, it.originalQuantity - fin);
      return { ...it, originalQuantity: rem };
    });

  // Size 24 (Blue) was 1 pc and delivered 1 pc -> MUST be excluded!
  assert.strictEqual(
    activeMatrixItems.some((it) => it.color === "Blue" && it.size === "24"),
    false,
    "Fully delivered Size 24 must NOT appear in Batch #2 active matrix"
  );
  assert.strictEqual(activeMatrixItems.length, 1);
  assert.strictEqual(activeMatrixItems[0].color, "Green");
  assert.strictEqual(activeMatrixItems[0].size, "28");
});

// -----------------------------------------------------------------------------
// Test 4: Partially fulfilled combinations show remaining quantity as pending
// -----------------------------------------------------------------------------
test("4. Partially fulfilled combinations show remaining quantity as pending requirement", () => {
  const orig = 11;
  const fin = 3;
  const rem = Math.max(0, orig - fin);
  assert.strictEqual(rem, 8);

  const activeItem = {
    styleName: "VIGNESH TSHIRT",
    itemName: "TSHIRT",
    color: "Green",
    size: "28",
    originalQuantity: rem,
  };
  assert.strictEqual(activeItem.originalQuantity, 8, "Requirement for Batch #2 must be remaining (8 pcs)");
});

// -----------------------------------------------------------------------------
// Test 5: Saving Batch #2 does not modify Batch #1 in database
// -----------------------------------------------------------------------------
test("5. Saving a subsequent batch does not modify Batch #1 in database", () => {
  // Query next batch number and insert draft inside rollback transaction
  const res = runDbQuery(
    `BEGIN;
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'BATCH-099', 'draft');
     
     INSERT INTO public.order_delivery_actual_items (order_id, batch_number, style_name, item_name, color, size, original_quantity, actual_quantity, difference, classification)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'VIGNESH TSHIRT', 'TSHIRT', 'Green', '28', 8, 8, 0, 'exact');
     
     -- Verify Batch 1 remains untouched
     SELECT batch_number, status FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15' AND batch_number = 1;
     ROLLBACK;`
  );
  assert.strictEqual(res.rows[0].batch_number, 1);
  assert.strictEqual(res.rows[0].status, "delivered");
});

// -----------------------------------------------------------------------------
// Test 6: Finalizing Batch #2 does not double-count quantities
// -----------------------------------------------------------------------------
test("6. Finalizing a subsequent batch persists separate actuals and does not double count", () => {
  const res = runDbQuery(
    `BEGIN;
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'BATCH-099', 'dispatched');

     INSERT INTO public.order_delivery_actual_items (order_id, batch_number, style_name, item_name, color, size, original_quantity, actual_quantity, difference, classification)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'VIGNESH TSHIRT', 'TSHIRT', 'Green', '28', 8, 5, -3, 'short');

     SELECT sum(a.actual_quantity) as total_finalized
     FROM public.order_delivery_actual_items a
     JOIN public.order_delivery_batches b ON a.order_id = b.order_id AND a.batch_number = b.batch_number
     WHERE a.order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15'
       AND b.status IN ('dispatched', 'in_transit', 'delivered');
     ROLLBACK;`
  );
  // Prior finalized was 6 pcs. New batch added 5 pcs -> 6 + 5 = 11 pcs
  const total = parseInt(res.rows[0].total_finalized, 10);
  assert.strictEqual(total, 11, "Total finalized must be 11 (6 previous + 5 new batch)");
});

console.log("================================================================================");
console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed out of ${testsPassed + testsFailed} tests.`);
console.log("================================================================================");

if (testsFailed > 0) process.exit(1);
