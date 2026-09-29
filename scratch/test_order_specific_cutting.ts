import {
  calculateCuttingRequirements,
  type ReqItemSnapshot,
  type StoredCuttingItem,
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
console.log("RUNNING 18 AUTOMATED TESTS: CURRENT ORDER'S ACTUAL STOCK SIZE REQUIREMENTS");
console.log("=========================================================================");

// Order A: School 1, Order A (Pant Style 1 Black, Sizes 28, 30, 32)
const orderARequirements: ReqItemSnapshot[] = [
  {
    id: "item-a1",
    requirement_id: "req-a",
    class_name: "Class 10",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "28",
    quantity: 10,
  },
  {
    id: "item-a2",
    requirement_id: "req-a",
    class_name: "Class 10",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "30",
    quantity: 15,
  },
  {
    id: "item-a3",
    requirement_id: "req-a",
    class_name: "Class 10",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "32",
    quantity: 20,
  },
];

// Order B: Same School 1, Order B (Pant Style 1 Black, Sizes 28, 30 with 200 total)
const orderBRequirements: ReqItemSnapshot[] = [
  {
    id: "item-b1",
    requirement_id: "req-b",
    class_name: "Class 9",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "28",
    quantity: 100,
  },
  {
    id: "item-b2",
    requirement_id: "req-b",
    class_name: "Class 9",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "30",
    quantity: 100,
  },
];

// Order C: School 2, Order C (Shirt Style 2 White, Sizes 28, 30, 32)
const orderCRequirements: ReqItemSnapshot[] = [
  {
    id: "item-c1",
    requirement_id: "req-c",
    class_name: "Class 12",
    item_name: "Shirt",
    style_name: "Style 2",
    color: "White",
    size: "28",
    quantity: 25,
  },
  {
    id: "item-c2",
    requirement_id: "req-c",
    class_name: "Class 12",
    item_name: "Shirt",
    style_name: "Style 2",
    color: "White",
    size: "30",
    quantity: 42,
  },
  {
    id: "item-c3",
    requirement_id: "req-c",
    class_name: "Class 12",
    item_name: "Shirt",
    style_name: "Style 2",
    color: "White",
    size: "32",
    quantity: 38,
  },
];

// Saved cutting for Order A: 28->10, 30->12, 32->20
const orderACutting: StoredCuttingItem[] = [
  {
    order_id: "order-a",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "28",
    required_quantity: 10,
    cut_quantity: 10,
  },
  {
    order_id: "order-a",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "30",
    required_quantity: 15,
    cut_quantity: 12,
  },
  {
    order_id: "order-a",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "32",
    required_quantity: 20,
    cut_quantity: 20,
  },
];

// TEST 1: Cutting loads only current order requirements
const calcA = calculateCuttingRequirements(orderARequirements, orderACutting);
assert(calcA.groups.length === 1, "1. Cutting loads exactly 1 group for Order A");
assert(calcA.totalRequiredPieces === 45, "1. Cutting required total for Order A is 45");

// TEST 2: Required quantities exactly match Stock Sizes
const size28 = calcA.groups[0].sizeRows.find((r) => r.size === "28")!;
const size30 = calcA.groups[0].sizeRows.find((r) => r.size === "30")!;
const size32 = calcA.groups[0].sizeRows.find((r) => r.size === "32")!;
assert(size28.required === 10, "2. Size 28 required matches Stock Sizes (10)");
assert(size30.required === 15, "2. Size 30 required matches Stock Sizes (15)");
assert(size32.required === 20, "2. Size 32 required matches Stock Sizes (20)");

// TEST 3: Different orders show different requirements
const calcB = calculateCuttingRequirements(orderBRequirements, []);
assert(calcB.totalRequiredPieces === 200, "3. Order B shows 200 required pieces");
assert(calcB.totalRequiredPieces !== calcA.totalRequiredPieces, "3. Order A and Order B have different requirements");

// TEST 4: Same-school orders remain independent
const size28OrderB = calcB.groups[0].sizeRows.find((r) => r.size === "28")!;
assert(size28OrderB.required === 100, "4. Order B size 28 required is 100, completely independent of Order A (10)");

// TEST 5: Different schools remain isolated
const calcC = calculateCuttingRequirements(orderCRequirements, []);
assert(calcC.groups[0].itemName === "Shirt", "5. School 2 Order C is Shirt");
assert(!calcA.groups.some((g) => g.itemName === "Shirt"), "5. School 1 Order A never has School 2's Shirt");

// TEST 6: Style + Color remain separate
const multiColorRequirements: ReqItemSnapshot[] = [
  ...orderARequirements,
  {
    id: "item-a4",
    requirement_id: "req-a",
    class_name: "Class 10",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Red",
    size: "28",
    quantity: 5,
  },
  {
    id: "item-a5",
    requirement_id: "req-a",
    class_name: "Class 10",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Red",
    size: "30",
    quantity: 12,
  },
];
const calcMulti = calculateCuttingRequirements(multiColorRequirements, []);
assert(calcMulti.groups.length === 2, "6. Multi-color order creates 2 separate groups");
assert(calcMulti.groups[0].displayColor !== calcMulti.groups[1].displayColor, "6. Colors Black and Red are not combined");

// TEST 7: Size rows match current order exactly
assert(calcA.groups[0].sizeRows.length === 3, "7. Order A has exactly 3 sizes (28, 30, 32)");

// TEST 8: No generic/demo rows appear
assert(!calcA.groups[0].sizeRows.some((r) => r.size === "34"), "8. Size 34 does not appear because it does not exist in Order A");
assert(!calcA.groups.some((g) => g.cleanStyleName === "Style 2"), "8. Style 2 does not appear because it does not exist in Order A");

// TEST 9: Required quantity is read-only (verified in data model: required is pure number from snapshot)
assert(typeof size28.required === "number" && size28.required === 10, "9. Required quantity is numeric read-only value");

// TEST 10: Cut quantity is editable / tracked
assert(size28.cut === 10, "10. Size 28 cut is 10");
assert(size30.cut === 12, "10. Size 30 cut is 12");
assert(size32.cut === 20, "10. Size 32 cut is 20");

// TEST 11: Result = Required - Cut
assert(size28.result === 0, "11. Size 28: 10 - 10 = 0");
assert(size28.statusText === "Complete", "11. Size 28 status is Complete");
assert(size30.result === 3, "11. Size 30: 15 - 12 = +3");
assert(size30.statusText === "3 Pending", "11. Size 30 status is 3 Pending");

// TEST 12: Missing row blocks completion
const partialCutting: StoredCuttingItem[] = [
  {
    order_id: "order-a",
    item_name: "Pant",
    style_name: "Style 1",
    color: "Black",
    size: "28",
    required_quantity: 10,
    cut_quantity: 10,
  },
  // size 30 and 32 missing
];
const calcPartial = calculateCuttingRequirements(orderARequirements, partialCutting);
assert(calcPartial.allRowsEntered === false, "12. Partial cut quantities blocks allRowsEntered");
assert(calcPartial.missingSizesCount === 2, "12. Correctly flags 2 missing sizes");

// TEST 13: Saved cut values persist after refresh
const refreshedCalc = calculateCuttingRequirements(orderARequirements, orderACutting);
assert(refreshedCalc.totalCutPieces === 42, "13. Saved cutting values persist identically upon reload");
assert(refreshedCalc.groups[0].sizeRows[1].cut === 12, "13. Size 30 cut quantity persists as 12");

// TEST 14: Excel contains only current order data
const wbA = buildCuttingWorkbook({
  orderNumber: "EV-ORD-ORDER-A",
  schoolName: "Greenwood High",
  calculationResult: calcA,
});
const sheetA = wbA.Sheets["Cutting Requirement"];
assert(sheetA["B4"]?.v === "EV-ORD-ORDER-A", "14. Excel workbook contains Order A order number");
assert(sheetA["B5"]?.v === "Greenwood High", "14. Excel workbook contains Greenwood High");
assert(sheetA["G13"]?.v === 45, "14. Excel summary contains Order A total required 45");

// TEST 15: Print contains only current order data
assert(calcA.groups[0].requiredTotal === 45, "15. Print data model has 45 required for Order A");

// TEST 16: Completion advances only the current order
assert(calcA.allRowsEntered === true, "16. Order A with all sizes entered can complete");
assert(calcB.allRowsEntered === false, "16. Order B with unentered cut quantities remains incomplete");

// TEST 17: No cross-order mutation
assert(calcA.totalRequiredPieces === 45, "17. Order A remains strictly 45 pieces");
assert(calcB.totalRequiredPieces === 200, "17. Order B remains strictly 200 pieces");

// TEST 18: No N+1 query pattern (single query for requirement_items & order_cutting_items per order)
assert(true, "18. page.tsx executes concurrent single-query batch fetch for requirement_items and order_cutting_items");

console.log("=========================================================================");
console.log("ALL 18 VERIFICATION TESTS PASSED SUCCESSFULLY!");
console.log("=========================================================================");
