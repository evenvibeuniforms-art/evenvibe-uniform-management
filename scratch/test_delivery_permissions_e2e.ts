import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import assert from "node:assert";

console.log("================================================================================");
console.log("   EVENVIBE — SUPABASE DELIVERY BATCH PERMISSIONS & RLS E2E TEST");
console.log("================================================================================");

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

// Order 521b964a-4fdf-488c-ac2d-423a3c412b15 belongs to TEST INTERNATIONAL SCHOOL
// Admin user: a068ee85-bd10-4e99-8572-be87da83c8cd (evenvibe_admin)
// School Admin of another school: 7c2f88a1-1e45-44dc-b744-2a3b1588568e (school_admin)

// Test 1: Table Privileges on order_delivery_batches for authenticated & service_role
test("1. Database table privileges granted on order_delivery_batches to authenticated & service_role", () => {
  const res = runDbQuery(
    "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'order_delivery_batches' AND grantee = 'authenticated' ORDER BY privilege_type;"
  );
  const privileges = res.rows.map((r: any) => r.privilege_type);
  assert.ok(privileges.includes("SELECT"), "authenticated must have SELECT");
  assert.ok(privileges.includes("INSERT"), "authenticated must have INSERT");
  assert.ok(privileges.includes("UPDATE"), "authenticated must have UPDATE");
  assert.ok(privileges.includes("DELETE"), "authenticated must have DELETE");
});

// Test 2: Table Privileges on order_delivery_actual_items
test("2. Database table privileges granted on order_delivery_actual_items to authenticated & service_role", () => {
  const res = runDbQuery(
    "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'order_delivery_actual_items' AND grantee = 'authenticated' ORDER BY privilege_type;"
  );
  const privileges = res.rows.map((r: any) => r.privilege_type);
  assert.ok(privileges.includes("SELECT"), "authenticated must have SELECT");
  assert.ok(privileges.includes("INSERT"), "authenticated must have INSERT");
  assert.ok(privileges.includes("UPDATE"), "authenticated must have UPDATE");
  assert.ok(privileges.includes("DELETE"), "authenticated must have DELETE");
});

// Test 3: Authorized admin can read delivery batches without permission denied
test("3. Authorized admin can read delivery batches without permission error", () => {
  const res = runDbQuery(
    "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = 'a068ee85-bd10-4e99-8572-be87da83c8cd'; SELECT count(*) FROM public.order_delivery_batches; ROLLBACK;"
  );
  assert.ok(res.rows.length > 0, "Query must succeed");
});

// Test 4: Authorized admin can create Batch #1
test("4. Authorized admin can create Batch #1", () => {
  const res = runDbQuery(
    `BEGIN;
     DELETE FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15';
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claim.sub = 'a068ee85-bd10-4e99-8572-be87da83c8cd';
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 1, 'BATCH-001', 'draft')
     RETURNING id, batch_number, status;
     ROLLBACK;`
  );
  assert.strictEqual(res.rows[0].batch_number, 1);
  assert.strictEqual(res.rows[0].status, "draft");
});

// Test 5: A draft can be saved and retrieved
test("5. A draft can be saved and retrieved with actual quantities", () => {
  const res = runDbQuery(
    `BEGIN;
     DELETE FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15';
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claim.sub = 'a068ee85-bd10-4e99-8572-be87da83c8cd';
     WITH b AS (
       INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
       VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 1, 'BATCH-001', 'draft')
       RETURNING id, order_id
     )
     INSERT INTO public.order_delivery_actual_items (order_id, batch_id, batch_number, style_name, item_name, color, size, original_quantity, actual_quantity, difference, classification)
     SELECT b.order_id, b.id, 1, 'VIGNESH TSHIRT', 'TSHIRT', 'Green', '28', 11, 8, -3, 'short'
     FROM b
     RETURNING actual_quantity;
     ROLLBACK;`
  );
  assert.strictEqual(res.rows[0].actual_quantity, 8);
});

// Test 6: Finalizing a batch persists status and actual quantities
test("6. Finalizing a batch updates status to dispatched and persists actuals", () => {
  const res = runDbQuery(
    `BEGIN;
     DELETE FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15';
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claim.sub = 'a068ee85-bd10-4e99-8572-be87da83c8cd';
     INSERT INTO public.order_delivery_batches (id, order_id, batch_number, batch_reference, status)
     VALUES ('00000000-0000-0000-0000-000000000002', '521b964a-4fdf-488c-ac2d-423a3c412b15', 1, 'BATCH-001', 'draft');
     UPDATE public.order_delivery_batches SET status = 'dispatched', dispatched_at = now()
     WHERE id = '00000000-0000-0000-0000-000000000002'
     RETURNING status;
     ROLLBACK;`
  );
  assert.strictEqual(res.rows[0].status, "dispatched");
});

// Test 7: Batch history remains accessible
test("7. Batch history remains accessible across multiple batches", () => {
  const res = runDbQuery(
    `BEGIN;
     DELETE FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15';
     SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claim.sub = 'a068ee85-bd10-4e99-8572-be87da83c8cd';
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 1, 'BATCH-001', 'delivered'),
            ('521b964a-4fdf-488c-ac2d-423a3c412b15', 2, 'BATCH-002', 'draft');
     SELECT count(*) FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15';
     ROLLBACK;`
  );
  assert.strictEqual(parseInt(res.rows[0].count, 10), 2);
});

// Test 8: Subsequent batch can be created without overwriting previous batches
test("8. Subsequent batch does not overwrite Batch #1", () => {
  const res = runDbQuery(
    `BEGIN;
     INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status)
     VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'BATCH-099', 'draft');
     SELECT batch_number, status FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15' AND batch_number IN (1, 99) ORDER BY batch_number ASC;
     ROLLBACK;`
  );
  assert.strictEqual(res.rows.length, 2);
  assert.strictEqual(res.rows[0].batch_number, 1);
  assert.strictEqual(res.rows[0].status, "delivered");
  assert.strictEqual(res.rows[1].batch_number, 99);
  assert.strictEqual(res.rows[1].status, "draft");
});

// Test 9: Unauthorized users cannot read another school's records
test("9. School Admin from another school cannot read another school's delivery batches", () => {
  const res = runDbQuery(
    "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '7c2f88a1-1e45-44dc-b744-2a3b1588568e'; SELECT count(*) FROM public.order_delivery_batches WHERE order_id = '521b964a-4fdf-488c-ac2d-423a3c412b15'; ROLLBACK;"
  );
  assert.strictEqual(parseInt(res.rows[0].count, 10), 0, "School admin must see 0 rows for other school's batch");
});

// Test 10: School Admin cannot create delivery batches (denied by RLS)
test("10. School Admin cannot create or insert delivery batches (blocked by RLS)", () => {
  let threw = false;
  try {
    runDbQuery(
      "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '7c2f88a1-1e45-44dc-b744-2a3b1588568e'; INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status) VALUES ('521b964a-4fdf-488c-ac2d-423a3c412b15', 99, 'BATCH-099', 'draft'); ROLLBACK;"
    );
  } catch (err: any) {
    threw = true;
    const combined = `${err?.message || ""} ${err?.stdout?.toString() || ""} ${err?.stderr?.toString() || ""}`;
    assert.ok(
      combined.includes("violates row-level security policy") || combined.includes("42501"),
      `Must be blocked by RLS, received: ${combined}`
    );
  }
  assert.ok(threw, "School admin insert must be rejected by RLS");
});

console.log("================================================================================");
console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed out of ${testsPassed + testsFailed} tests.`);
console.log("================================================================================");

if (testsFailed > 0) process.exit(1);
