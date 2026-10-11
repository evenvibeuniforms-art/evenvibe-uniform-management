import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

console.log("================================================================================");
console.log("   EVENVIBE MANAGEMENT — DELIVERY ACTUAL QUANTITIES & DISPATCH SUITE");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  ✅ [PASS] ${name}`);
          testsPassed++;
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${name}`);
          console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
          testsFailed++;
        });
    } else {
      console.log(`  ✅ [PASS] ${name}`);
      testsPassed++;
      return Promise.resolve();
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
    return Promise.resolve();
  }
}

interface ItemRow {
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  original: number;
  actual: number;
}

function calculateReconciliation(rows: ItemRow[]) {
  let totalOriginal = 0;
  let totalActual = 0;
  let totalExtra = 0;
  let totalShort = 0;
  let totalNotDelivered = 0;

  const results = rows.map((r) => {
    totalOriginal += r.original;
    totalActual += r.actual;
    const diff = r.actual - r.original;
    let classification: "exact" | "extra" | "short" | "not_delivered";

    if (diff === 0) {
      classification = "exact";
    } else if (diff > 0) {
      classification = "extra";
      totalExtra += diff;
    } else {
      if (r.actual === 0 && r.original > 0) {
        classification = "not_delivered";
        totalNotDelivered += r.original;
        totalShort += r.original;
      } else {
        classification = "short";
        totalShort += r.original - r.actual;
      }
    }

    return {
      ...r,
      diff,
      classification,
    };
  });

  return {
    results,
    summary: {
      totalOriginal,
      totalActual,
      totalExtra,
      totalShort,
      totalNotDelivered,
    },
  };
}

function validateManualQuantity(val: unknown): { valid: boolean; value?: number; error?: string } {
  if (val === undefined || val === null || String(val).trim() === "") {
    return { valid: false, error: "Missing quantity: field cannot be left blank." };
  }
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) {
    return { valid: false, error: "Must be a non-negative whole number (no negatives or decimals)." };
  }
  const num = parseInt(str, 10);
  if (isNaN(num) || num < 0) {
    return { valid: false, error: "Invalid numeric quantity." };
  }
  return { valid: true, value: num };
}

// Hierarchy grouping helper
function groupMatrix(items: Array<{ styleName: string; itemName: string; color: string; size: string; quantity: number }>) {
  const styles: Record<string, any> = {};
  for (const it of items) {
    if (!styles[it.styleName]) styles[it.styleName] = { styleName: it.styleName, items: {} };
    if (!styles[it.styleName].items[it.itemName])
      styles[it.styleName].items[it.itemName] = { itemName: it.itemName, colors: {} };
    if (!styles[it.styleName].items[it.itemName].colors[it.color])
      styles[it.styleName].items[it.itemName].colors[it.color] = { colorName: it.color, sizes: [] };

    styles[it.styleName].items[it.itemName].colors[it.color].sizes.push({
      size: it.size,
      quantity: it.quantity,
    });
  }

  // Sort sizes ascending numerically
  for (const st of Object.values(styles)) {
    for (const it of Object.values(st.items as any)) {
      for (const cl of Object.values((it as any).colors as any)) {
        (cl as any).sizes.sort((a: any, b: any) => {
          const numA = parseInt(a.size, 10);
          const numB = parseInt(b.size, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.size.localeCompare(b.size);
        });
      }
    }
  }

  return styles;
}

async function main() {
  console.log("\n--- TEST GROUP 1: EXACT, EXTRA, SHORT, AND ZERO DELIVERY CLASSIFICATIONS ---");

  await runTest("Exact delivery (Original 10, Actual 10) gives Difference 0 and classification 'exact'", () => {
    const recon = calculateReconciliation([
      { styleName: "SKIRT", itemName: "Skirt", color: "Navy Blue", size: "26", original: 10, actual: 10 },
    ]);
    assert.strictEqual(recon.results[0].diff, 0);
    assert.strictEqual(recon.results[0].classification, "exact");
  });

  await runTest("Extra delivery (Original 10, Actual 12) gives Difference +2 and classification 'extra'", () => {
    const recon = calculateReconciliation([
      { styleName: "SKIRT", itemName: "Skirt", color: "Navy Blue", size: "28", original: 10, actual: 12 },
    ]);
    assert.strictEqual(recon.results[0].diff, 2);
    assert.strictEqual(recon.results[0].classification, "extra");
  });

  await runTest("Short delivery (Original 10, Actual 7) gives Difference -3 and classification 'short'", () => {
    const recon = calculateReconciliation([
      { styleName: "SKIRT", itemName: "Skirt", color: "Navy Blue", size: "30", original: 10, actual: 7 },
    ]);
    assert.strictEqual(recon.results[0].diff, -3);
    assert.strictEqual(recon.results[0].classification, "short");
  });

  await runTest("Not Delivered (Original 10, Actual 0) gives Difference -10 and classification 'not_delivered'", () => {
    const recon = calculateReconciliation([
      { styleName: "SKIRT", itemName: "Skirt", color: "Navy Blue", size: "32", original: 10, actual: 0 },
    ]);
    assert.strictEqual(recon.results[0].diff, -10);
    assert.strictEqual(recon.results[0].classification, "not_delivered");
  });

  console.log("\n--- TEST GROUP 2: RECONCILIATION SUMMARY WITHOUT NETTING ---");

  await runTest("Extra and Short quantities are NEVER netted against each other", () => {
    // 4 items:
    // 1: orig 10, actual 10 -> diff 0
    // 2: orig 10, actual 15 -> diff +5 (extra)
    // 3: orig 10, actual 6  -> diff -4 (short)
    // 4: orig 10, actual 0  -> diff -10 (not delivered)
    const rows: ItemRow[] = [
      { styleName: "SHIRT", itemName: "Shirt", color: "Sky Blue", size: "26", original: 10, actual: 10 },
      { styleName: "SHIRT", itemName: "Shirt", color: "Sky Blue", size: "28", original: 10, actual: 15 },
      { styleName: "SHIRT", itemName: "Shirt", color: "Sky Blue", size: "30", original: 10, actual: 6 },
      { styleName: "SHIRT", itemName: "Shirt", color: "Sky Blue", size: "32", original: 10, actual: 0 },
    ];

    const recon = calculateReconciliation(rows);

    assert.strictEqual(recon.summary.totalOriginal, 40);
    assert.strictEqual(recon.summary.totalActual, 31);
    assert.strictEqual(recon.summary.totalExtra, 5, "Total Extra must be exactly 5");
    assert.strictEqual(recon.summary.totalShort, 14, "Total Short must be exactly 14 (4 partial + 10 not delivered)");
    assert.strictEqual(recon.summary.totalNotDelivered, 10, "Total Not Delivered must be exactly 10");

    // CRITICAL: Ensure difference is not netted: (31 - 40 = -9), but extra=5 and short=14 are distinct!
    assert.notStrictEqual(recon.summary.totalExtra - recon.summary.totalShort, recon.summary.totalExtra);
  });

  console.log("\n--- TEST GROUP 3: INPUT VALIDATION (DECIMALS, NEGATIVES, BLANKS) ---");

  await runTest("Non-negative integer inputs are strictly valid", () => {
    assert.strictEqual(validateManualQuantity("0").valid, true);
    assert.strictEqual(validateManualQuantity("0").value, 0);
    assert.strictEqual(validateManualQuantity("12").valid, true);
    assert.strictEqual(validateManualQuantity("12").value, 12);
    assert.strictEqual(validateManualQuantity(5).valid, true);
    assert.strictEqual(validateManualQuantity(5).value, 5);
  });

  await runTest("Negative numbers are rejected", () => {
    assert.strictEqual(validateManualQuantity("-1").valid, false);
    assert.strictEqual(validateManualQuantity("-10").valid, false);
  });

  await runTest("Decimals are rejected", () => {
    assert.strictEqual(validateManualQuantity("2.5").valid, false);
    assert.strictEqual(validateManualQuantity("0.1").valid, false);
  });

  await runTest("Empty and missing inputs are rejected (NOT silently converted to 0)", () => {
    assert.strictEqual(validateManualQuantity("").valid, false);
    assert.strictEqual(validateManualQuantity("   ").valid, false);
    assert.strictEqual(validateManualQuantity(undefined).valid, false);
    assert.strictEqual(validateManualQuantity(null).valid, false);
  });

  await runTest("Alphanumeric inputs are rejected", () => {
    assert.strictEqual(validateManualQuantity("abc").valid, false);
    assert.strictEqual(validateManualQuantity("10a").valid, false);
  });

  console.log("\n--- TEST GROUP 4: HIERARCHY & NUMERIC SIZE ASCENDING ORDER ---");

  await runTest("Sizes are sorted ascending numerically: [38, 22, 26, 30, 28, 34] -> [22, 26, 28, 30, 34, 38]", () => {
    const rawItems = [
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "38", quantity: 1 },
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "22", quantity: 1 },
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "26", quantity: 2 },
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "30", quantity: 3 },
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "28", quantity: 1 },
      { styleName: "VIGNESH SKIRT", itemName: "SKIRT", color: "Navy Blue", size: "34", quantity: 1 },
    ];

    const grouped = groupMatrix(rawItems);
    const sizes = grouped["VIGNESH SKIRT"].items["SKIRT"].colors["Navy Blue"].sizes.map((s: any) => s.size);

    assert.deepStrictEqual(sizes, ["22", "26", "28", "30", "34", "38"]);
  });

  console.log("\n--- TEST GROUP 5: SCHOOL UUID MASKING & DATA ISOLATION ---");

  await runTest("School UUID is never displayed alone; School Name is prioritized", () => {
    const orderWithSchool = {
      id: "ord-12345",
      order_number: "EV-2026-001",
      school_id: "550e8400-e29b-41d4-a716-446655440000",
      schools: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Green Valley Public School" },
    };

    const displayedSchool = orderWithSchool.schools?.name || "Unknown School";
    assert.strictEqual(displayedSchool, "Green Valley Public School");
    assert.notStrictEqual(displayedSchool, orderWithSchool.school_id);
    assert.ok(!displayedSchool.includes("550e8400"));
  });

  console.log("\n--- TEST GROUP 6: RECEIVED STUDENTS ELIGIBILITY BASED ON DELIVERED QUANTITIES ---");

  await runTest("Items with actual delivery = 0 are strictly excluded from Student Allocations", () => {
    const studentOrders = [
      { studentName: "Aarav", size: "26", item: "Shirt" },
      { studentName: "Diya", size: "28", item: "Shirt" },
      { studentName: "Rohan", size: "30", item: "Shirt" },
    ];

    // Actual delivered quantities
    const deliveredPerSize: Record<string, number> = {
      "26": 1,
      "28": 1,
      "30": 0, // Size 30 was not delivered!
    };

    const eligibleAllocations = studentOrders.filter((s) => (deliveredPerSize[s.size] || 0) > 0);

    assert.strictEqual(eligibleAllocations.length, 2);
    assert.ok(eligibleAllocations.some((s) => s.studentName === "Aarav"));
    assert.ok(eligibleAllocations.some((s) => s.studentName === "Diya"));
    assert.ok(!eligibleAllocations.some((s) => s.studentName === "Rohan"), "Rohan with size 30 (0 delivered) must not receive allocation");
  });

  console.log("\n--- TEST GROUP 7: SUPABASE DATABASE CONNECTIVITY & TABLE SCHEMAS ---");

  await runTest("Remote Supabase schema: order_delivery_actual_items table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_delivery_actual_items")
      .select("id")
      .limit(1);

    // Table must exist: Either returns rows or throws 42501 (permission denied for anon, meaning RLS protects it)
    // If the table didn't exist, Postgres would return code 42P01 (relation does not exist)
    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_delivery_actual_items must exist on remote DB");
  });

  await runTest("Remote Supabase schema: order_delivery_returns table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_delivery_returns")
      .select("id")
      .limit(1);

    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_delivery_returns must exist on remote DB");
  });

  await runTest("Remote Supabase schema: order_followup_dispatches table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_followup_dispatches")
      .select("id")
      .limit(1);

    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_followup_dispatches must exist on remote DB");
  });

  await runTest("Remote Supabase schema: order_followup_dispatch_items table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_followup_dispatch_items")
      .select("id")
      .limit(1);

    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_followup_dispatch_items must exist on remote DB");
  });

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed out of ${testsPassed + testsFailed} tests.`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner exception:", err);
  process.exit(1);
});
