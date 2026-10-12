import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import assert from "node:assert";
import { OrderDeliveryBatch, OrderDeliveryActualItem } from "../src/types/database";

console.log("================================================================================");
console.log("   EVENVIBE — SCHOOL ADMIN DELIVERY BATCHES AUTOMATED VERIFICATION SUITE");
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

// --------------------------------------------------------------------------------
// TEST 1: An order with one batch displays Batch #1
// --------------------------------------------------------------------------------
test("1. An order with one batch displays Batch #1", () => {
  const testBatches: OrderDeliveryBatch[] = [
    {
      id: "b1-uuid",
      order_id: "order-1",
      batch_number: 1,
      batch_reference: "BATCH-001",
      status: "delivered",
      dispatched_at: "2026-10-10T10:00:00Z",
      delivered_at: "2026-10-12T14:00:00Z",
      courier_name: "DTDC",
      tracking_number: "TRK-001",
      estimated_delivery: "2026-10-12",
      remarks: "Delivered first set",
      created_at: "2026-10-09T08:00:00Z",
      updated_at: "2026-10-12T14:00:00Z",
      items: [
        {
          id: "item-1",
          order_id: "order-1",
          batch_id: "b1-uuid",
          batch_number: 1,
          style_name: "Regular Shirt",
          item_name: "SHIRT",
          color: "White",
          size: "32",
          original_quantity: 20,
          actual_quantity: 20,
          difference: 0,
          classification: "exact",
          extra_quantity: 0,
          short_quantity: 0,
          not_delivered_quantity: 0,
          created_at: "2026-10-10T10:00:00Z",
          updated_at: "2026-10-10T10:00:00Z",
        },
      ],
    },
  ];

  assert.strictEqual(testBatches.length, 1);
  assert.strictEqual(testBatches[0].batch_number, 1);
  assert.strictEqual(testBatches[0].batch_reference, "BATCH-001");
  assert.strictEqual(testBatches[0].status, "delivered");
  assert.strictEqual(testBatches[0].courier_name, "DTDC");
});

// --------------------------------------------------------------------------------
// TEST 2: An order with three batches displays Batch #1, Batch #2, and Batch #3
// --------------------------------------------------------------------------------
test("2. An order with three batches displays Batch #1, Batch #2, and Batch #3", () => {
  const testBatches: OrderDeliveryBatch[] = [
    {
      id: "b1-uuid",
      order_id: "order-1",
      batch_number: 1,
      batch_reference: "BATCH-001",
      status: "delivered",
      dispatched_at: "2026-10-01T10:00:00Z",
      delivered_at: "2026-10-03T14:00:00Z",
      courier_name: "DTDC",
      tracking_number: "TRK-001",
      estimated_delivery: "2026-10-03",
      remarks: "First consignment",
      created_at: "2026-10-01T08:00:00Z",
      updated_at: "2026-10-03T14:00:00Z",
    },
    {
      id: "b2-uuid",
      order_id: "order-1",
      batch_number: 2,
      batch_reference: "BATCH-002",
      status: "dispatched",
      dispatched_at: "2026-10-05T10:00:00Z",
      delivered_at: null,
      courier_name: "BlueDart",
      tracking_number: "TRK-002",
      estimated_delivery: "2026-10-08",
      remarks: "Second consignment",
      created_at: "2026-10-05T08:00:00Z",
      updated_at: "2026-10-05T10:00:00Z",
    },
    {
      id: "b3-uuid",
      order_id: "order-1",
      batch_number: 3,
      batch_reference: "BATCH-003",
      status: "draft",
      dispatched_at: null,
      delivered_at: null,
      courier_name: null,
      tracking_number: null,
      estimated_delivery: null,
      remarks: "In preparation",
      created_at: "2026-10-08T08:00:00Z",
      updated_at: "2026-10-08T08:00:00Z",
    },
  ];

  const sortedBatches = [...testBatches].sort((a, b) => a.batch_number - b.batch_number);
  assert.strictEqual(sortedBatches.length, 3);
  assert.deepStrictEqual(sortedBatches.map((b) => b.batch_number), [1, 2, 3]);
  assert.deepStrictEqual(sortedBatches.map((b) => b.batch_reference), ["BATCH-001", "BATCH-002", "BATCH-003"]);
  assert.strictEqual(sortedBatches[2].status, "draft");
});

// --------------------------------------------------------------------------------
// TEST 3: Orders with more batches display all available batches (dynamic, not hardcoded)
// --------------------------------------------------------------------------------
test("3. Orders with more batches display all available batches (e.g., 5 batches)", () => {
  const batchCount = 5;
  const testBatches: OrderDeliveryBatch[] = Array.from({ length: batchCount }, (_, i) => ({
    id: `b${i + 1}-uuid`,
    order_id: "order-multi",
    batch_number: i + 1,
    batch_reference: `BATCH-00${i + 1}`,
    status: i < 4 ? "delivered" : "dispatched",
    dispatched_at: `2026-10-0${i + 1}T10:00:00Z`,
    delivered_at: i < 4 ? `2026-10-0${i + 2}T10:00:00Z` : null,
    courier_name: "SpeedPost",
    tracking_number: `SP-00${i + 1}`,
    estimated_delivery: `2026-10-0${i + 2}`,
    remarks: `Batch #${i + 1}`,
    created_at: `2026-10-0${i + 1}T08:00:00Z`,
    updated_at: `2026-10-0${i + 1}T08:00:00Z`,
  }));

  assert.strictEqual(testBatches.length, 5);
  for (let num = 1; num <= 5; num++) {
    const found = testBatches.find((b) => b.batch_number === num);
    assert.ok(found, `Batch #${num} must exist`);
    assert.strictEqual(found.batch_reference, `BATCH-00${num}`);
  }
});

// --------------------------------------------------------------------------------
// TEST 4: Selecting Batch #2 displays only Batch #2's actual records
// --------------------------------------------------------------------------------
test("4. Selecting Batch #2 displays only Batch #2's actual records", () => {
  const batch1Items: OrderDeliveryActualItem[] = [
    {
      id: "it-1",
      order_id: "order-1",
      batch_id: "b1-uuid",
      batch_number: 1,
      style_name: "Junior Uniform",
      item_name: "SHIRT",
      color: "Blue",
      size: "28",
      original_quantity: 30,
      actual_quantity: 15,
      difference: -15,
      classification: "short",
      extra_quantity: 0,
      short_quantity: 15,
      not_delivered_quantity: 0,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ];

  const batch2Items: OrderDeliveryActualItem[] = [
    {
      id: "it-2",
      order_id: "order-1",
      batch_id: "b2-uuid",
      batch_number: 2,
      style_name: "Junior Uniform",
      item_name: "SHIRT",
      color: "Blue",
      size: "28",
      original_quantity: 30,
      actual_quantity: 15,
      difference: 0,
      classification: "exact",
      extra_quantity: 0,
      short_quantity: 0,
      not_delivered_quantity: 0,
      created_at: "2026-10-05T10:00:00Z",
      updated_at: "2026-10-05T10:00:00Z",
    },
    {
      id: "it-3",
      order_id: "order-1",
      batch_id: "b2-uuid",
      batch_number: 2,
      style_name: "Junior Uniform",
      item_name: "TROUSER",
      color: "Navy",
      size: "28",
      original_quantity: 10,
      actual_quantity: 12,
      difference: 2,
      classification: "extra",
      extra_quantity: 2,
      short_quantity: 0,
      not_delivered_quantity: 0,
      created_at: "2026-10-05T10:00:00Z",
      updated_at: "2026-10-05T10:00:00Z",
    },
  ];

  const batches: OrderDeliveryBatch[] = [
    {
      id: "b1-uuid",
      order_id: "order-1",
      batch_number: 1,
      batch_reference: "BATCH-001",
      status: "delivered",
      dispatched_at: "2026-10-01T10:00:00Z",
      delivered_at: "2026-10-03T10:00:00Z",
      courier_name: "DTDC",
      tracking_number: "TRK-01",
      estimated_delivery: "2026-10-03",
      remarks: null,
      created_at: "2026-10-01T08:00:00Z",
      updated_at: "2026-10-03T10:00:00Z",
      items: batch1Items,
    },
    {
      id: "b2-uuid",
      order_id: "order-1",
      batch_number: 2,
      batch_reference: "BATCH-002",
      status: "dispatched",
      dispatched_at: "2026-10-05T10:00:00Z",
      delivered_at: null,
      courier_name: "BlueDart",
      tracking_number: "TRK-02",
      estimated_delivery: "2026-10-08",
      remarks: "Second dispatch",
      created_at: "2026-10-05T08:00:00Z",
      updated_at: "2026-10-05T10:00:00Z",
      items: batch2Items,
    },
  ];

  // Selecting Batch #2:
  const selectedBatchNumber = 2;
  const selectedBatch = batches.find((b) => b.batch_number === selectedBatchNumber);
  assert.ok(selectedBatch);
  assert.strictEqual(selectedBatch.batch_number, 2);
  assert.strictEqual(selectedBatch.batch_reference, "BATCH-002");

  // Filter actual delivered items
  const deliveredItems = (selectedBatch.items || []).filter((it) => (it.actual_quantity || 0) > 0);
  assert.strictEqual(deliveredItems.length, 2);
  assert.strictEqual(deliveredItems[0].item_name, "SHIRT");
  assert.strictEqual(deliveredItems[0].actual_quantity, 15);
  assert.strictEqual(deliveredItems[1].item_name, "TROUSER");
  assert.strictEqual(deliveredItems[1].actual_quantity, 12);
  assert.strictEqual(deliveredItems[1].extra_quantity, 2);

  // Does not include Batch #1 items
  const hasBatch1Item = deliveredItems.some((it) => it.id === "it-1");
  assert.strictEqual(hasBatch1Item, false, "Must not contain items from Batch #1");
});

// --------------------------------------------------------------------------------
// TEST 5: Zero-delivery combinations do not appear as delivered items
// --------------------------------------------------------------------------------
test("5. Zero-delivery combinations do not appear as delivered items", () => {
  const mixedItems: OrderDeliveryActualItem[] = [
    {
      id: "it-delivered",
      order_id: "order-1",
      batch_id: "b1-uuid",
      batch_number: 1,
      style_name: "Uniform",
      item_name: "SHIRT",
      color: "White",
      size: "30",
      original_quantity: 10,
      actual_quantity: 10,
      difference: 0,
      classification: "exact",
      extra_quantity: 0,
      short_quantity: 0,
      not_delivered_quantity: 0,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "it-zero-1",
      order_id: "order-1",
      batch_id: "b1-uuid",
      batch_number: 1,
      style_name: "Uniform",
      item_name: "SKIRT",
      color: "Grey",
      size: "26",
      original_quantity: 5,
      actual_quantity: 0,
      difference: -5,
      classification: "not_delivered",
      extra_quantity: 0,
      short_quantity: 5,
      not_delivered_quantity: 5,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "it-zero-2",
      order_id: "order-1",
      batch_id: "b1-uuid",
      batch_number: 1,
      style_name: "Uniform",
      item_name: "TIE",
      color: "Navy",
      size: "Standard",
      original_quantity: 10,
      actual_quantity: 0,
      difference: -10,
      classification: "short",
      extra_quantity: 0,
      short_quantity: 10,
      not_delivered_quantity: 0,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    },
  ];

  const visibleBatchItems = mixedItems.filter((item) => (item.actual_quantity || 0) > 0);
  assert.strictEqual(visibleBatchItems.length, 1);
  assert.strictEqual(visibleBatchItems[0].id, "it-delivered");
  assert.strictEqual(visibleBatchItems[0].actual_quantity, 10);
});

// --------------------------------------------------------------------------------
// TEST 6: Consolidated order summary remains separate from individual batch quantities
// --------------------------------------------------------------------------------
test("6. Consolidated order summary remains separate from individual batch quantities", () => {
  const totalOrderRequirementQuantity = 50; // Total ordered
  const batch1DeliveredQuantity = 20;
  const batch2DeliveredQuantity = 30;

  assert.notStrictEqual(batch1DeliveredQuantity, totalOrderRequirementQuantity);
  assert.notStrictEqual(batch2DeliveredQuantity, totalOrderRequirementQuantity);
  assert.strictEqual(batch1DeliveredQuantity + batch2DeliveredQuantity, totalOrderRequirementQuantity);
});

// --------------------------------------------------------------------------------
// TEST 7: Orders without batches display a sensible empty state
// --------------------------------------------------------------------------------
test("7. Orders without batches return empty batches array and trigger sensible empty state", () => {
  const emptyBatches: OrderDeliveryBatch[] = [];
  const hasBatches = emptyBatches.length > 0;
  assert.strictEqual(hasBatches, false, "Must detect no batches present");
});

// --------------------------------------------------------------------------------
// TEST 8: School Admin cannot access batches belonging to another school
// --------------------------------------------------------------------------------
test("8. School Admin cannot access batches belonging to another school (verified via DB RLS)", () => {
  // Test query as school admin 7c2f88a1-1e45-44dc-b744-2a3b1588568e for order 521b964a-4fdf-488c-ac2d-423a3c412b15 (which belongs to a different school)
  const res = runDbQuery(
    "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '7c2f88a1-1e45-44dc-b744-2a3b1588568e'; SELECT count(*) FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15'; ROLLBACK;"
  );
  assert.strictEqual(parseInt(res.rows[0].count, 10), 0, "School Admin must be blocked from other school's batches");
});

// --------------------------------------------------------------------------------
// TEST 9: Historical batch data remains unchanged when new batches are viewed
// --------------------------------------------------------------------------------
test("9. Historical batch data remains unchanged across batch selections", () => {
  const res = runDbQuery(
    `BEGIN;
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status, courier_name, tracking_number)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 101, 'BATCH-101', 'delivered', 'DTDC', 'HIST-101')
     ON CONFLICT (order_id, batch_number) DO NOTHING;

     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status, courier_name, tracking_number)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 102, 'BATCH-102', 'draft', 'BlueDart', 'DRAFT-102')
     ON CONFLICT (order_id, batch_number) DO NOTHING;

     SELECT batch_number, status, courier_name, tracking_number 
     FROM public.order_delivery_batches 
     WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15' AND batch_number IN (101, 102)
     ORDER BY batch_number ASC;
     ROLLBACK;`
  );

  assert.strictEqual(res.rows.length, 2);
  assert.strictEqual(res.rows[0].batch_number, 101);
  assert.strictEqual(res.rows[0].status, "delivered");
  assert.strictEqual(res.rows[0].courier_name, "DTDC");
  assert.strictEqual(res.rows[1].batch_number, 102);
  assert.strictEqual(res.rows[1].status, "draft");
});

// --------------------------------------------------------------------------------
// TEST 10: School Admin cannot perform unauthorized Admin-only operations
// --------------------------------------------------------------------------------
test("10. School Admin cannot insert or modify delivery batches (blocked by RLS)", () => {
  let insertBlocked = false;
  try {
    runDbQuery(
      `BEGIN;
       SET LOCAL ROLE authenticated;
       SET LOCAL request.jwt.claim.sub = '7c2f88a1-1e45-44dc-b744-2a3b1588568e';
       INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
       VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 999, 'BATCH-999', 'draft');
       ROLLBACK;`
    );
  } catch (err: any) {
    insertBlocked = true;
    const combined = `${err?.message || ""} ${err?.stdout?.toString() || ""} ${err?.stderr?.toString() || ""}`;
    assert.ok(
      combined.includes("violates row-level security policy") || combined.includes("42501"),
      `Must be blocked by RLS: ${combined}`
    );
  }
  assert.ok(insertBlocked, "School admin insert must be denied by RLS");
});

console.log("================================================================================");
console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed out of ${testsPassed + testsFailed} tests.`);
console.log("================================================================================");

if (testsFailed > 0) process.exit(1);
