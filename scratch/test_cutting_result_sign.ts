import {
  calculateCuttingRequirements,
  ReqItemSnapshot,
  StoredCuttingItem,
} from "../src/lib/production/cuttingCalculations";
import { buildCuttingWorkbook } from "../src/lib/production/exportCuttingExcel";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log("=========================================================================");
console.log("RUNNING CUTTING RESULT SIGN & STATUS LOGIC VERIFICATION TESTS");
console.log("=========================================================================");

// ---------------------------------------------------------------------------------
// Test 1: Required 10, Cut 12 → Result +2 → Extra Cut
// ---------------------------------------------------------------------------------
const reqItem1: ReqItemSnapshot[] = [
  {
    id: "item-1",
    requirement_id: "req-1",
    class_name: "Class 10",
    item_name: "Shirt",
    style_name: "Full Sleeve",
    color: "White",
    size: "38",
    quantity: 10,
  },
];

const savedItem1: StoredCuttingItem[] = [
  {
    order_id: "order-1",
    item_name: "Shirt",
    style_name: "Full Sleeve",
    color: "White",
    size: "38",
    required_quantity: 10,
    cut_quantity: 12,
  },
];

const res1 = calculateCuttingRequirements(reqItem1, savedItem1);
const row1 = res1.groups[0].sizeRows[0];

assert(row1.result === 2, `1. Result is +2 (got ${row1.result})`);
assert(row1.resultDisplay === "+2", `1. Result display is '+2' (got '${row1.resultDisplay}')`);
assert(row1.statusType === "extra_cut", `1. Status type is 'extra_cut' (got '${row1.statusType}')`);
assert(row1.statusText === "2 Extra Cut", `1. Status text is '2 Extra Cut' (got '${row1.statusText}')`);
assert(res1.groups[0].extraCutTotal === 2, `1. Group extraCutTotal is 2 (got ${res1.groups[0].extraCutTotal})`);
assert(res1.groups[0].pendingTotal === 0, `1. Group pendingTotal is 0 (got ${res1.groups[0].pendingTotal})`);

// ---------------------------------------------------------------------------------
// Test 2: Required 10, Cut 8 → Result -2 → Pending
// ---------------------------------------------------------------------------------
const savedItem2: StoredCuttingItem[] = [
  {
    order_id: "order-1",
    item_name: "Shirt",
    style_name: "Full Sleeve",
    color: "White",
    size: "38",
    required_quantity: 10,
    cut_quantity: 8,
  },
];

const res2 = calculateCuttingRequirements(reqItem1, savedItem2);
const row2 = res2.groups[0].sizeRows[0];

assert(row2.result === -2, `2. Result is -2 (got ${row2.result})`);
assert(row2.resultDisplay === "-2", `2. Result display is '-2' (got '${row2.resultDisplay}')`);
assert(row2.statusType === "pending", `2. Status type is 'pending' (got '${row2.statusType}')`);
assert(row2.statusText === "2 Pending", `2. Status text is '2 Pending' (got '${row2.statusText}')`);
assert(res2.groups[0].pendingTotal === 2, `2. Group pendingTotal is 2 (got ${res2.groups[0].pendingTotal})`);
assert(res2.groups[0].extraCutTotal === 0, `2. Group extraCutTotal is 0 (got ${res2.groups[0].extraCutTotal})`);

// ---------------------------------------------------------------------------------
// Test 3: Required 10, Cut 10 → Result 0 → Complete
// ---------------------------------------------------------------------------------
const savedItem3: StoredCuttingItem[] = [
  {
    order_id: "order-1",
    item_name: "Shirt",
    style_name: "Full Sleeve",
    color: "White",
    size: "38",
    required_quantity: 10,
    cut_quantity: 10,
  },
];

const res3 = calculateCuttingRequirements(reqItem1, savedItem3);
const row3 = res3.groups[0].sizeRows[0];

assert(row3.result === 0, `3. Result is 0 (got ${row3.result})`);
assert(row3.resultDisplay === "0", `3. Result display is '0' (got '${row3.resultDisplay}')`);
assert(row3.statusType === "complete", `3. Status type is 'complete' (got '${row3.statusType}')`);
assert(row3.statusText === "Complete", `3. Status text is 'Complete' (got '${row3.statusText}')`);
assert(res3.groups[0].pendingTotal === 0, `3. Group pendingTotal is 0 (got ${res3.groups[0].pendingTotal})`);
assert(res3.groups[0].extraCutTotal === 0, `3. Group extraCutTotal is 0 (got ${res3.groups[0].extraCutTotal})`);

// ---------------------------------------------------------------------------------
// Test 4: Required 1, Cut 2 → Result +1 → 1 Extra Cut
// ---------------------------------------------------------------------------------
const reqItemSingle: ReqItemSnapshot[] = [
  {
    id: "item-single",
    requirement_id: "req-single",
    class_name: "Class 5",
    item_name: "Pant",
    style_name: "Formal",
    color: "Navy Blue",
    size: "26",
    quantity: 1,
  },
];

const savedItemSingleExtra: StoredCuttingItem[] = [
  {
    order_id: "order-1",
    item_name: "Pant",
    style_name: "Formal",
    color: "Navy Blue",
    size: "26",
    required_quantity: 1,
    cut_quantity: 2,
  },
];

const res4 = calculateCuttingRequirements(reqItemSingle, savedItemSingleExtra);
const row4 = res4.groups[0].sizeRows[0];

assert(row4.result === 1, `4. Result is +1 (got ${row4.result})`);
assert(row4.resultDisplay === "+1", `4. Result display is '+1' (got '${row4.resultDisplay}')`);
assert(row4.statusType === "extra_cut", `4. Status type is 'extra_cut'`);
assert(row4.statusText === "1 Extra Cut", `4. Status text is '1 Extra Cut' (got '${row4.statusText}')`);

// ---------------------------------------------------------------------------------
// Test 5: Required 1, Cut 0 → Result -1 → 1 Pending
// ---------------------------------------------------------------------------------
const savedItemSinglePending: StoredCuttingItem[] = [
  {
    order_id: "order-1",
    item_name: "Pant",
    style_name: "Formal",
    color: "Navy Blue",
    size: "26",
    required_quantity: 1,
    cut_quantity: 0,
  },
];

const res5 = calculateCuttingRequirements(reqItemSingle, savedItemSinglePending);
const row5 = res5.groups[0].sizeRows[0];

assert(row5.result === -1, `5. Result is -1 (got ${row5.result})`);
assert(row5.resultDisplay === "-1", `5. Result display is '-1' (got '${row5.resultDisplay}')`);
assert(row5.statusType === "pending", `5. Status type is 'pending'`);
assert(row5.statusText === "1 Pending", `5. Status text is '1 Pending' (got '${row5.statusText}')`);

// ---------------------------------------------------------------------------------
// Test 6 & 7: Mixed sizes calculate Pending and Extra Cut independently
// ---------------------------------------------------------------------------------
// Size 28: Required 10, Cut 12 -> Result +2, Extra Cut = 2
// Size 30: Required 10, Cut 8  -> Result -2, Pending = 2
// Combined net difference is 0, BUT Total Pending must be 2, Total Extra Cut must be 2!
const mixedReqItems: ReqItemSnapshot[] = [
  {
    id: "item-m1",
    requirement_id: "req-m",
    class_name: "Class 8",
    item_name: "T-Shirt",
    style_name: "Polo",
    color: "Red",
    size: "28",
    quantity: 10,
  },
  {
    id: "item-m2",
    requirement_id: "req-m",
    class_name: "Class 8",
    item_name: "T-Shirt",
    style_name: "Polo",
    color: "Red",
    size: "30",
    quantity: 10,
  },
];

const mixedSavedItems: StoredCuttingItem[] = [
  {
    order_id: "order-m",
    item_name: "T-Shirt",
    style_name: "Polo",
    color: "Red",
    size: "28",
    required_quantity: 10,
    cut_quantity: 12,
  },
  {
    order_id: "order-m",
    item_name: "T-Shirt",
    style_name: "Polo",
    color: "Red",
    size: "30",
    required_quantity: 10,
    cut_quantity: 8,
  },
];

const resMixed = calculateCuttingRequirements(mixedReqItems, mixedSavedItems);
const groupMixed = resMixed.groups[0];

assert(groupMixed.requiredTotal === 20, `Group required total is 20 (got ${groupMixed.requiredTotal})`);
assert(groupMixed.cutTotal === 20, `Group cut total is 20 (got ${groupMixed.cutTotal})`);
assert(groupMixed.pendingTotal === 2, `6. Mixed sizes calculate Pending independently = 2 (got ${groupMixed.pendingTotal})`);
assert(groupMixed.extraCutTotal === 2, `7. Mixed sizes calculate Extra Cut independently = 2 (got ${groupMixed.extraCutTotal})`);
assert(resMixed.totalPendingPieces === 2, `6. Overall totalPendingPieces = 2 (got ${resMixed.totalPendingPieces})`);
assert(resMixed.totalExtraCutPieces === 2, `7. Overall totalExtraCutPieces = 2 (got ${resMixed.totalExtraCutPieces})`);

// ---------------------------------------------------------------------------------
// Test 8: Screen matches Excel
// ---------------------------------------------------------------------------------
const wb = buildCuttingWorkbook({
  orderNumber: "ORD-TEST-SIGN",
  schoolName: "Test Model School",
  calculationResult: resMixed,
});

const sheet = wb.Sheets["Cutting Requirement"];
// Size 28 row (Row 9 in Excel):
// Column G (Required) = 10, Column H (Cut) = 12, Column I (Result) = "+2", Column J (Status) = "2 Extra Cut"
assert(sheet["G9"]?.v === 10, `8. Excel Required is 10 (got ${sheet["G9"]?.v})`);
assert(sheet["H9"]?.v === 12, `8. Excel Cut is 12 (got ${sheet["H9"]?.v})`);
assert(sheet["I9"]?.v === "+2", `8. Excel Result has '+2' sign (got '${sheet["I9"]?.v}')`);
assert(sheet["J9"]?.v === "2 Extra Cut", `8. Excel Status is '2 Extra Cut' (got '${sheet["J9"]?.v}')`);

// Size 30 row (Row 10 in Excel):
// Column G (Required) = 10, Column H (Cut) = 8, Column I (Result) = "-2", Column J (Status) = "2 Pending"
assert(sheet["G10"]?.v === 10, `8. Excel Required is 10 (got ${sheet["G10"]?.v})`);
assert(sheet["H10"]?.v === 8, `8. Excel Cut is 8 (got ${sheet["H10"]?.v})`);
assert(sheet["I10"]?.v === "-2", `8. Excel Result has '-2' sign (got '${sheet["I10"]?.v}')`);
assert(sheet["J10"]?.v === "2 Pending", `8. Excel Status is '2 Pending' (got '${sheet["J10"]?.v}')`);

// Summary row (Row 12 in Excel):
assert(sheet["I12"]?.v === "+2 -2", `8. Excel summary row shows both signs: '+2 -2' (got '${sheet["I12"]?.v}')`);

// ---------------------------------------------------------------------------------
// Test 9 & 10: Style + Color Group Totals match size-level results
// ---------------------------------------------------------------------------------
assert(
  groupMixed.sizeRows[0].resultDisplay === "+2",
  "10. Size 28 resultDisplay matches '+2'"
);
assert(
  groupMixed.sizeRows[1].resultDisplay === "-2",
  "10. Size 30 resultDisplay matches '-2'"
);

console.log("\n=========================================================================");
console.log("ALL CUTTING RESULT SIGN & STATUS TESTS PASSED SUCCESSFULLY! 🎉");
console.log("=========================================================================\n");
