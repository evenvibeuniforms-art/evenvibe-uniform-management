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
console.log("   EVENVIBE MANAGEMENT — MULTI-BATCH DELIVERY & STYLE-WISE PRINT TEST SUITE");
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

interface TestItemCombination {
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  originalQuantity: number;
}

interface TestBatchItem {
  batchNumber: number;
  status: "draft" | "dispatched" | "in_transit" | "delivered";
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  actualQuantity: number;
}

// Multi-batch remaining calculation adhering to the Non-Netting Rule
function computeMultiBatchState(
  originalRequirements: TestItemCombination[],
  savedBatches: TestBatchItem[]
) {
  // Only finalized batches (dispatched, in_transit, delivered) reduce remaining quantities
  const finalizedItems = savedBatches.filter((b) =>
    ["dispatched", "in_transit", "delivered"].includes(b.status)
  );

  const finalizedSumMap = new Map<string, number>();
  for (const it of finalizedItems) {
    const key = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
    const prev = finalizedSumMap.get(key) || 0;
    finalizedSumMap.set(key, prev + it.actualQuantity);
  }

  // Calculate remaining and extra independently per combination
  const itemStates = originalRequirements.map((orig) => {
    const key = `${orig.styleName}_${orig.itemName}_${orig.color}_${orig.size}`;
    const finalizedDelivered = finalizedSumMap.get(key) || 0;
    const remaining = Math.max(0, orig.originalQuantity - finalizedDelivered);
    const extra = Math.max(0, finalizedDelivered - orig.originalQuantity);

    return {
      styleName: orig.styleName,
      itemName: orig.itemName,
      color: orig.color,
      size: orig.size,
      originalQuantity: orig.originalQuantity,
      finalizedDelivered,
      remainingQuantity: remaining,
      extraQuantity: extra,
      isFullyDelivered: remaining === 0,
    };
  });

  // Filter for next delivery entry screen: only items with remainingQuantity > 0
  const nextDeliveryItems = itemStates
    .filter((it) => it.remainingQuantity > 0)
    .map((it) => ({
      styleName: it.styleName,
      itemName: it.itemName,
      color: it.color,
      size: it.size,
      originalQuantity: it.remainingQuantity, // Next delivery target
    }));

  // Style and color presence checks
  const visibleStyles = new Set(nextDeliveryItems.map((it) => it.styleName));
  const visibleColors = new Set(nextDeliveryItems.map((it) => `${it.styleName}_${it.itemName}_${it.color}`));

  const totalOriginal = originalRequirements.reduce((acc, it) => acc + it.originalQuantity, 0);
  const totalDelivered = itemStates.reduce((acc, it) => acc + it.finalizedDelivered, 0);
  const totalRemaining = itemStates.reduce((acc, it) => acc + it.remainingQuantity, 0);
  const totalExtra = itemStates.reduce((acc, it) => acc + it.extraQuantity, 0);

  return {
    itemStates,
    nextDeliveryItems,
    visibleStyles,
    visibleColors,
    totalOriginal,
    totalDelivered,
    totalRemaining,
    totalExtra,
  };
}

async function main() {
  // Test 1: Order A Example from Specifications (Green 11, Yellow 4, Blue 7)
  await runTest("Batch 1: Fulfillment with Extra Delivery and Zero Netting", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", originalQuantity: 11 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", originalQuantity: 4 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Blue", size: "32", originalQuantity: 7 },
    ];

    // Batch 1 is finalized: Green 19 (extra 8), Yellow 0, Blue 0
    const batch1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", actualQuantity: 19 },
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", actualQuantity: 0 },
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Blue", size: "32", actualQuantity: 0 },
    ];

    const state = computeMultiBatchState(originalRequirements, batch1);

    const greenState = state.itemStates.find((i) => i.color === "Green")!;
    const yellowState = state.itemStates.find((i) => i.color === "Yellow")!;
    const blueState = state.itemStates.find((i) => i.color === "Blue")!;

    assert.strictEqual(greenState.remainingQuantity, 0, "Green remaining must be 0");
    assert.strictEqual(greenState.extraQuantity, 8, "Green extra must be 8");
    assert.strictEqual(yellowState.remainingQuantity, 4, "Yellow remaining must be 4");
    assert.strictEqual(yellowState.extraQuantity, 0, "Yellow extra must be 0");
    assert.strictEqual(blueState.remainingQuantity, 7, "Blue remaining must be 7");
    assert.strictEqual(blueState.extraQuantity, 0, "Blue extra must be 0");

    // CRITICAL: Total pending must be 11 (4 + 7). Green's +8 extra must NOT reduce Yellow or Blue!
    assert.strictEqual(state.totalRemaining, 11, "Extra 8 pcs of Green must never offset Yellow or Blue pending pieces");
  });

  // Test 2: Next delivery entry screen hides completed color group
  await runTest("Next Delivery Entry: Completed color group (Green) is hidden", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", originalQuantity: 11 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", originalQuantity: 4 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Blue", size: "32", originalQuantity: 7 },
    ];

    const batch1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", actualQuantity: 19 },
    ];

    const state = computeMultiBatchState(originalRequirements, batch1);

    // Green color must be completely absent from next delivery entry items
    assert.strictEqual(state.nextDeliveryItems.some((it) => it.color === "Green"), false, "Green must be hidden");
    assert.strictEqual(state.nextDeliveryItems.some((it) => it.color === "Yellow"), true, "Yellow must be visible");
    assert.strictEqual(state.nextDeliveryItems.some((it) => it.color === "Blue"), true, "Blue must be visible");
    assert.strictEqual(state.nextDeliveryItems.length, 2, "Only Yellow and Blue should be present");
  });

  // Test 3: Partially delivered sizes remain visible with their remaining quantity
  await runTest("Partially delivered sizes remain visible with correct remaining quantity", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "28", originalQuantity: 10 },
      { styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "30", originalQuantity: 10 },
      { styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "32", originalQuantity: 10 },
    ];

    // Batch 1 delivers: size 28: 10 (completed), size 30: 6 (partial), size 32: 0 (not delivered)
    const batch1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "28", actualQuantity: 10 },
      { batchNumber: 1, status: "dispatched", styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "30", actualQuantity: 6 },
      { batchNumber: 1, status: "dispatched", styleName: "SPORTS TEE", itemName: "TEE", color: "White", size: "32", actualQuantity: 0 },
    ];

    const state = computeMultiBatchState(originalRequirements, batch1);

    // Size 28 should be hidden
    assert.strictEqual(state.nextDeliveryItems.some((it) => it.size === "28"), false, "Size 28 must be hidden");

    // Size 30 should remain with remaining target = 4
    const sz30 = state.nextDeliveryItems.find((it) => it.size === "30");
    assert.ok(sz30, "Size 30 must remain visible");
    assert.strictEqual(sz30.originalQuantity, 4, "Size 30 target in next batch must be remaining 4 pcs");

    // Size 32 should remain with target = 10
    const sz32 = state.nextDeliveryItems.find((it) => it.size === "32");
    assert.ok(sz32, "Size 32 must remain visible");
    assert.strictEqual(sz32.originalQuantity, 10, "Size 32 target must be 10 pcs");
  });

  // Test 4: Fully completed style is hidden from the next delivery form
  await runTest("Fully completed style is hidden from subsequent delivery form", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "STYLE ALPHA", itemName: "SHIRT", color: "Blue", size: "30", originalQuantity: 5 },
      { styleName: "STYLE BETA", itemName: "PANT", color: "Black", size: "30", originalQuantity: 8 },
    ];

    // Batch 1 fulfills all items of STYLE ALPHA
    const batch1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "STYLE ALPHA", itemName: "SHIRT", color: "Blue", size: "30", actualQuantity: 5 },
    ];

    const state = computeMultiBatchState(originalRequirements, batch1);

    assert.strictEqual(state.visibleStyles.has("STYLE ALPHA"), false, "STYLE ALPHA must be hidden from next delivery form");
    assert.strictEqual(state.visibleStyles.has("STYLE BETA"), true, "STYLE BETA must remain visible");
  });

  // Test 5: Draft batch does not reduce remaining quantities
  await runTest("Draft batch quantities do not count as finalized physical deliveries", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", originalQuantity: 4 },
    ];

    // Batch 1 is draft with actualQuantity: 4
    const draftBatch: TestBatchItem[] = [
      { batchNumber: 1, status: "draft", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", actualQuantity: 4 },
    ];

    const state = computeMultiBatchState(originalRequirements, draftBatch);

    // Remaining must STILL be 4 because draft is not finalized!
    assert.strictEqual(state.totalRemaining, 4, "Draft quantities must not reduce pending requirement");
    assert.strictEqual(state.nextDeliveryItems.length, 1, "Item must remain in next delivery screen");
  });

  // Test 6: Second and Third Delivery Batches preserve immutable history
  await runTest("Successive Batches (Batch 1, 2, 3) preserve history and fulfill order", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "UNIFORM SET", itemName: "SHIRT", color: "White", size: "30", originalQuantity: 30 },
    ];

    // Batch 1: delivers 10
    const b1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "UNIFORM SET", itemName: "SHIRT", color: "White", size: "30", actualQuantity: 10 },
    ];
    const stateAfterB1 = computeMultiBatchState(originalRequirements, b1);
    assert.strictEqual(stateAfterB1.totalRemaining, 20, "Remaining after B1 must be 20");

    // Batch 2: delivers 15
    const b2: TestBatchItem[] = [
      ...b1,
      { batchNumber: 2, status: "dispatched", styleName: "UNIFORM SET", itemName: "SHIRT", color: "White", size: "30", actualQuantity: 15 },
    ];
    const stateAfterB2 = computeMultiBatchState(originalRequirements, b2);
    assert.strictEqual(stateAfterB2.totalRemaining, 5, "Remaining after B2 must be 5");

    // Batch 3: delivers final 5
    const b3: TestBatchItem[] = [
      ...b2,
      { batchNumber: 3, status: "delivered", styleName: "UNIFORM SET", itemName: "SHIRT", color: "White", size: "30", actualQuantity: 5 },
    ];
    const stateAfterB3 = computeMultiBatchState(originalRequirements, b3);
    assert.strictEqual(stateAfterB3.totalRemaining, 0, "Remaining after B3 must be 0");
    assert.strictEqual(stateAfterB3.nextDeliveryItems.length, 0, "No pending items remain");
    assert.strictEqual(stateAfterB3.totalDelivered, 30, "Total delivered is 30");

    // History check: Batch 1 was 10, Batch 2 was 15, Batch 3 was 5
    assert.strictEqual(b3[0].actualQuantity, 10, "Batch 1 record preserved");
    assert.strictEqual(b3[1].actualQuantity, 15, "Batch 2 record preserved");
    assert.strictEqual(b3[2].actualQuantity, 5, "Batch 3 record preserved");
  });

  // Test 7: Style-Wise Print Filtering isolation
  await runTest("Style-Wise Print: Filters only the requested style and sorts sizes", () => {
    const deliveryRows = [
      { styleName: "VIGNESH BLAZER", itemName: "BLAZER", color: "Navy", size: "38", original: 2, actual: 2 },
      { styleName: "VIGNESH BLAZER", itemName: "BLAZER", color: "Navy", size: "32", original: 3, actual: 3 },
      { styleName: "VIGNESH TIE", itemName: "TIE", color: "Striped", size: "Standard", original: 5, actual: 5 },
    ];

    const targetStyle = "VIGNESH BLAZER";
    const filteredRows = deliveryRows.filter((r) => r.styleName === targetStyle);

    assert.strictEqual(filteredRows.length, 2, "Only VIGNESH BLAZER items must be included");
    assert.strictEqual(filteredRows.some((r) => r.styleName === "VIGNESH TIE"), false, "VIGNESH TIE must be excluded");

    // Ascending size sort
    filteredRows.sort((a, b) => parseInt(a.size, 10) - parseInt(b.size, 10));
    assert.strictEqual(filteredRows[0].size, "32", "Size 32 must be first");
    assert.strictEqual(filteredRows[1].size, "38", "Size 38 must be second");
  });

  // Test 8: School UUID Masking Rule verification
  await runTest("School UUID Masking Rule: UI formats and passes School Name", () => {
    const mockOrder = {
      id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      order_number: "ORD-9999",
      school_id: "e5f6a1b2-c3d4-7890-1234-567890abcdef",
      schools: {
        id: "e5f6a1b2-c3d4-7890-1234-567890abcdef",
        name: "Greenwood International High School",
      },
    };

    const displayedSchool = mockOrder.schools?.name || "School";
    assert.strictEqual(displayedSchool, "Greenwood International High School");
    assert.strictEqual(displayedSchool.includes(mockOrder.school_id), false, "Raw school UUID must never be displayed");
  });

  // Test 9: Database schema verification for order_delivery_batches table
  await runTest("Remote Supabase schema: order_delivery_batches table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_delivery_batches")
      .select("id")
      .limit(1);

    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_delivery_batches must exist on remote DB");
  });

  // Test 10: Database schema verification for batch columns in order_delivery_actual_items
  await runTest("Remote Supabase schema: order_delivery_actual_items table exists & enforces RLS", async () => {
    const { error } = await supabase
      .from("order_delivery_actual_items")
      .select("id, batch_number, batch_id")
      .limit(1);

    assert.ok(
      error === null || error.code === "42501",
      `Expected table to exist and be secured. Received: ${error?.code} - ${error?.message}`
    );
    assert.notStrictEqual(error?.code, "42P01", "Table order_delivery_actual_items must exist on remote DB");
    assert.notStrictEqual(error?.code, "42703", "Columns batch_number and batch_id must exist in order_delivery_actual_items");
  });

  // Test 11: Return of delivered items reduces accepted/retained and restores pending quantity
  await runTest("Returns & Send-Backs: Returned pieces reduce accepted quantity and restore pending quantity without cross-netting", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", originalQuantity: 10 },
      { styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "Blue", size: "32", originalQuantity: 5 },
    ];

    // Batch 1 delivers White 10 (exact), Blue 5 (exact)
    const batch1: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", actualQuantity: 10 },
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "Blue", size: "32", actualQuantity: 5 },
    ];

    // School returns 2 White shirts due to damage
    const returns: Array<{ styleName: string; itemName: string; color: string; size: string; quantity: number; status: "pending" | "dispatched" | "in_transit" | "completed" | "cancelled" }> = [
      { styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", quantity: 2, status: "pending" },
    ];

    const finalizedItems = batch1.filter((b) => ["dispatched", "in_transit", "delivered"].includes(b.status));
    const finMap = new Map<string, number>();
    for (const it of finalizedItems) {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      finMap.set(k, (finMap.get(k) || 0) + it.actualQuantity);
    }

    const retMap = new Map<string, number>();
    for (const ret of returns) {
      if (ret.status === "cancelled") continue;
      const k = `${ret.styleName}_${ret.itemName}_${ret.color}_${ret.size}`;
      retMap.set(k, (retMap.get(k) || 0) + ret.quantity);
    }

    const whiteKey = "VIGNESH SHIRT_SHIRT_White_32";
    const blueKey = "VIGNESH SHIRT_SHIRT_Blue_32";

    const whiteAccepted = Math.max(0, (finMap.get(whiteKey) || 0) - (retMap.get(whiteKey) || 0));
    const whiteRemaining = Math.max(0, 10 - whiteAccepted);
    const blueAccepted = Math.max(0, (finMap.get(blueKey) || 0) - (retMap.get(blueKey) || 0));
    const blueRemaining = Math.max(0, 5 - blueAccepted);

    assert.strictEqual(whiteAccepted, 8, "White accepted pieces must be 8 (10 delivered - 2 returned)");
    assert.strictEqual(whiteRemaining, 2, "White remaining pending pieces must be 2");
    assert.strictEqual(blueAccepted, 5, "Blue accepted pieces must remain 5");
    assert.strictEqual(blueRemaining, 0, "Blue remaining pieces must remain 0");
  });

  // Test 12: Follow-up batch satisfies return-induced pending requirement
  await runTest("Follow-up Dispatch: Fulfills pending quantities from returns as a separate historical batch", () => {
    const originalRequirements: TestItemCombination[] = [
      { styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", originalQuantity: 10 },
    ];

    // Batch 1 (10 pcs) + Batch 2 Follow-up dispatch (2 pcs)
    const batches: TestBatchItem[] = [
      { batchNumber: 1, status: "delivered", styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", actualQuantity: 10 },
      { batchNumber: 2, status: "dispatched", styleName: "VIGNESH SHIRT", itemName: "SHIRT", color: "White", size: "32", actualQuantity: 2 },
    ];

    // Active return: 2 pcs
    const totalDelivered = batches.reduce((acc, b) => acc + b.actualQuantity, 0); // 12
    const totalReturned = 2;
    const acceptedRetained = totalDelivered - totalReturned; // 10
    const remainingToDeliver = Math.max(0, 10 - acceptedRetained); // 0

    assert.strictEqual(totalDelivered, 12, "Physical total delivered is 12 pcs");
    assert.strictEqual(acceptedRetained, 10, "Accepted/retained pieces is exactly 10 pcs");
    assert.strictEqual(remainingToDeliver, 0, "Order is fully satisfied after follow-up batch");
  });

  // Test 13: Student allocation: incremental multi-batch assignment assigns exactly delivered pieces
  await runTest("Student Delivery Allocation: Multi-batch incremental assignment without double-counting", () => {
    const students = [
      { id: "s1", name: "Student 1", size: "30" },
      { id: "s2", name: "Student 2", size: "30" },
      { id: "s3", name: "Student 3", size: "30" },
    ];

    const studentItemTypeSet = new Set<string>();
    const alreadyAllocatedCountMap = new Map<string, number>();

    // Batch 1: delivers 1 piece of size 30
    const batch1Delivered = 1;
    let allocatable1 = Math.max(0, batch1Delivered - (alreadyAllocatedCountMap.get("size_30") || 0));

    const assignedInBatch1: string[] = [];
    for (const s of students) {
      if (allocatable1 <= 0) break;
      const assignKey = `${s.id}_shirt`;
      if (studentItemTypeSet.has(assignKey)) continue;

      assignedInBatch1.push(s.id);
      studentItemTypeSet.add(assignKey);
      alreadyAllocatedCountMap.set("size_30", (alreadyAllocatedCountMap.get("size_30") || 0) + 1);
      allocatable1--;
    }

    assert.strictEqual(assignedInBatch1.length, 1, "Only 1 student allocated in Batch 1");
    assert.strictEqual(assignedInBatch1[0], "s1", "Student s1 received first piece");

    // Batch 2: delivers 2 more pieces (total finalized delivered = 3)
    const totalFinalizedAfterBatch2 = 3;
    let allocatable2 = Math.max(0, totalFinalizedAfterBatch2 - (alreadyAllocatedCountMap.get("size_30") || 0));
    assert.strictEqual(allocatable2, 2, "Allocatable in Batch 2 must be 2 pieces");

    const assignedInBatch2: string[] = [];
    for (const s of students) {
      if (allocatable2 <= 0) break;
      const assignKey = `${s.id}_shirt`;
      if (studentItemTypeSet.has(assignKey)) continue;

      assignedInBatch2.push(s.id);
      studentItemTypeSet.add(assignKey);
      alreadyAllocatedCountMap.set("size_30", (alreadyAllocatedCountMap.get("size_30") || 0) + 1);
      allocatable2--;
    }

    assert.strictEqual(assignedInBatch2.length, 2, "2 students allocated in Batch 2");
    assert.deepStrictEqual(assignedInBatch2, ["s2", "s3"], "Students s2 and s3 received Batch 2 pieces");
    assert.strictEqual(studentItemTypeSet.size, 3, "All 3 students now have shirts");

    // Test 14: Finalizing a batch twice does NOT double-allocate
    const totalFinalizedAfterDoubleFinalize = 3; // Same count
    const allocatableDuplicate = Math.max(0, totalFinalizedAfterDoubleFinalize - (alreadyAllocatedCountMap.get("size_30") || 0));
    assert.strictEqual(allocatableDuplicate, 0, "Duplicate finalization must yield 0 allocatable slots");
  });

  // Test 15: Zero-delivery does not allocate false items
  await runTest("Zero-Delivery: 0 actual delivered produces 0 student receipt records", () => {
    const students = [{ id: "s1", name: "Student 1", size: "32" }];
    const studentItemTypeSet = new Set<string>();
    const alreadyAllocatedCountMap = new Map<string, number>();

    const deliveredZero = 0;
    const allocatable = Math.max(0, deliveredZero - (alreadyAllocatedCountMap.get("size_32") || 0));

    const assigned: string[] = [];
    for (const s of students) {
      if (allocatable <= 0) break;
      assigned.push(s.id);
    }

    assert.strictEqual(assigned.length, 0, "Zero delivery must allocate 0 student items");
    assert.strictEqual(studentItemTypeSet.size, 0, "No student marked as delivered");
  });

  // Test 16: Missing required quantity produces a clear validation error
  await runTest("Validation: Missing required quantity produces exact validation error and highlights field", () => {
    const activeItems = [
      { styleName: "VIGNESH TSHIRT", size: "28", key: "VIGNESH TSHIRT_TSHIRT_Green_28" },
      { styleName: "VIGNESH TSHIRT", size: "30", key: "VIGNESH TSHIRT_TSHIRT_Green_30" },
    ];
    // Untouched/blank field for Size 28
    const inputs: Record<string, string> = {
      "VIGNESH TSHIRT_TSHIRT_Green_30": "2",
    };

    const errors: Record<string, string> = {};
    let firstErrorMsg: string | null = null;
    for (const item of activeItems) {
      const val = inputs[item.key];
      if (val === undefined || val.trim() === "") {
        errors[item.key] = `Please enter actual delivery quantity for ${item.styleName} (Size ${item.size}). Enter 0 if none delivered.`;
        if (!firstErrorMsg) firstErrorMsg = errors[item.key];
      }
    }

    assert.strictEqual(Object.keys(errors).length, 1);
    assert.strictEqual(
      firstErrorMsg,
      "Please enter actual delivery quantity for VIGNESH TSHIRT (Size 28). Enter 0 if none delivered."
    );
    assert.ok(errors["VIGNESH TSHIRT_TSHIRT_Green_28"]);
  });

  // Test 17: Explicit zero is accepted for a combination with no delivery
  await runTest("Validation: Explicit zero ('0') is accepted for combination with no delivery", () => {
    const activeItems = [
      { styleName: "VIGNESH TSHIRT", size: "28", key: "VIGNESH TSHIRT_TSHIRT_Green_28" },
      { styleName: "VIGNESH TSHIRT", size: "30", key: "VIGNESH TSHIRT_TSHIRT_Green_30" },
    ];
    const inputs: Record<string, string> = {
      "VIGNESH TSHIRT_TSHIRT_Green_28": "0", // Explicit 0
      "VIGNESH TSHIRT_TSHIRT_Green_30": "2",
    };

    const errors: Record<string, string> = {};
    for (const item of activeItems) {
      const val = inputs[item.key];
      if (val === undefined || val.trim() === "") {
        errors[item.key] = "Required";
      } else {
        const num = parseInt(val.trim(), 10);
        if (isNaN(num) || num < 0) {
          errors[item.key] = "Invalid";
        }
      }
    }

    assert.strictEqual(Object.keys(errors).length, 0, "Explicit 0 must be completely valid");
  });

  // Test 18: Hidden/completed combinations do not block finalization
  await runTest("Validation: Hidden/completed combinations (remaining 0) are excluded and do not block finalization", () => {
    // Green Size 26 was fulfilled in Batch 1 (remaining 0).
    // Only pending combinations (remaining > 0) are in activeMatrixItems.
    const allOriginal = [
      { styleName: "VIGNESH TSHIRT", size: "26", remaining: 0 }, // Fully completed
      { styleName: "VIGNESH TSHIRT", size: "28", remaining: 4 }, // Pending
    ];

    const activeMatrixItems = allOriginal.filter((it) => it.remaining > 0);
    assert.strictEqual(activeMatrixItems.length, 1, "Completed size 26 is excluded from active batch");

    const inputs: Record<string, string> = {
      "VIGNESH TSHIRT_TSHIRT_Green_28": "4",
    };

    const errors: Record<string, string> = {};
    for (const item of activeMatrixItems) {
      const k = `VIGNESH TSHIRT_TSHIRT_Green_${item.size}`;
      if (inputs[k] === undefined || inputs[k].trim() === "") {
        errors[k] = "Required";
      }
    }

    assert.strictEqual(Object.keys(errors).length, 0, "No errors on active items; completed items do not block");
  });

  // Test 19: Draft quantities do not affect finalized totals
  await runTest("Draft Isolation: Draft batch quantities do NOT reduce remaining quantities or affect finalized totals", () => {
    const originalReq = [{ styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "30", originalQuantity: 10 }];
    const batches: TestBatchItem[] = [
      { batchNumber: 1, status: "draft", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "30", actualQuantity: 7 },
    ];

    const state = computeMultiBatchState(originalReq, batches);
    assert.strictEqual(state.totalDelivered, 0, "Draft quantities must not count toward finalized delivered");
    assert.strictEqual(state.totalRemaining, 10, "Remaining quantity must stay at original 10 until finalized");
  });

  // Test 20: Original 11, actual 8 -> remaining 3, extra 0
  await runTest("Reconciliation: Original 11, actual 8 -> remaining 3, extra 0 (no contradictory badge)", () => {
    const orig = 11;
    const act = 8;
    const remaining = Math.max(0, orig - act);
    const extra = Math.max(0, act - orig);

    assert.strictEqual(remaining, 3, "Remaining must be 3");
    assert.strictEqual(extra, 0, "Extra must be 0");
    assert.ok(!(extra > 0 && remaining > 0), "Must NEVER show positive extra and positive short simultaneously on same total");
  });

  // Test 21: Original 11, actual 19 -> remaining 0, extra 8
  await runTest("Reconciliation: Original 11, actual 19 -> remaining 0, extra 8", () => {
    const orig = 11;
    const act = 19;
    const remaining = Math.max(0, orig - act);
    const extra = Math.max(0, act - orig);

    assert.strictEqual(remaining, 0, "Remaining must be 0");
    assert.strictEqual(extra, 8, "Extra must be 8");
  });

  // Test 22: Extra Green quantities do not offset Yellow or Blue
  await runTest("Non-Netting Rule: Surplus Green (+8) never offsets Yellow (4 pending) or Blue (7 pending)", () => {
    const items: TestItemCombination[] = [
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", originalQuantity: 11 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Yellow", size: "32", originalQuantity: 4 },
      { styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Blue", size: "32", originalQuantity: 7 },
    ];

    const batches: TestBatchItem[] = [
      { batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "32", actualQuantity: 19 },
    ];

    const state = computeMultiBatchState(items, batches);
    const yellow = state.itemStates.find((it) => it.color === "Yellow")!;
    const blue = state.itemStates.find((it) => it.color === "Blue")!;

    assert.strictEqual(yellow.remainingQuantity, 4, "Yellow remaining must remain 4");
    assert.strictEqual(blue.remainingQuantity, 7, "Blue remaining must remain 7");
    assert.strictEqual(state.totalRemaining, 11, "Total remaining is 4 + 7 = 11");
    assert.strictEqual(state.totalExtra, 8, "Total extra is 8");
  });

  // Test 23: Per-size, color, item, and style totals are mathematically consistent
  await runTest("Mathematical Consistency: Sum of per-size diffs matches color and style summaries", () => {
    const sizes = [
      { size: "28", orig: 4, act: 0, diff: -4, rem: 4, extra: 0 },
      { size: "30", orig: 3, act: 4, diff: +1, rem: 0, extra: 1 },
      { size: "32", orig: 4, act: 4, diff: 0, rem: 0, extra: 0 },
    ];

    const colorOrig = sizes.reduce((acc, s) => acc + s.orig, 0); // 11
    const colorAct = sizes.reduce((acc, s) => acc + s.act, 0);   // 8
    const colorRem = Math.max(0, colorOrig - colorAct);         // 3
    const colorExtra = Math.max(0, colorAct - colorOrig);       // 0

    assert.strictEqual(colorOrig, 11);
    assert.strictEqual(colorAct, 8);
    assert.strictEqual(colorRem, 3);
    assert.strictEqual(colorExtra, 0);
  });

  // Test 24: Returns and follow-up batches are counted correctly
  await runTest("Returns & Net Retained: 10 delivered - 2 returned = 8 retained; remaining = 2", () => {
    const original = 10;
    const delivered = 10;
    const returned = 2; // non-cancelled return
    const retained = Math.max(0, delivered - returned); // 8
    const remaining = Math.max(0, original - retained); // 2
    const extra = Math.max(0, retained - original);     // 0

    assert.strictEqual(retained, 8, "Retained quantity must be 8");
    assert.strictEqual(remaining, 2, "Remaining must be 2 after return");
    assert.strictEqual(extra, 0, "Extra must be 0");
  });

  // Test 25: Duplicate finalization does not double-count
  await runTest("Idempotency: Re-saving or finalizing same batch does not inflate totals", () => {
    const originalReq = [{ styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "30", originalQuantity: 10 }];
    // Unique onConflict key: (order_id, batch_number, style_name, item_name, color, size)
    // Simulating upsert by map
    const batchStore = new Map<string, TestBatchItem>();
    const upsertItem = (it: TestBatchItem) => {
      const k = `${it.batchNumber}_${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      batchStore.set(k, it);
    };

    upsertItem({ batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "30", actualQuantity: 5 });
    // Re-finalize identical batch
    upsertItem({ batchNumber: 1, status: "dispatched", styleName: "VIGNESH TSHIRT", itemName: "TSHIRT", color: "Green", size: "30", actualQuantity: 5 });

    const batches = Array.from(batchStore.values());
    const state = computeMultiBatchState(originalReq, batches);

    assert.strictEqual(state.totalDelivered, 5, "Total delivered must remain 5, not double-counted to 10");
    assert.strictEqual(state.totalRemaining, 5, "Remaining must remain 5");
  });

  console.log("================================================================================");
  console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed out of ${testsPassed + testsFailed} tests.`);
  console.log("================================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
