import {
  calculateCuttingRequirements,
  type ReqItemSnapshot,
  type StoredCuttingItem,
  type OrderStudentDetail,
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
console.log("RUNNING ORDER-SPECIFIC STUDENTS & CUTTING VERIFICATION TESTS");
console.log("=========================================================================");

// 1. Setup mock students for Order 1
// Notice: John Doe has 2 items (Shirt + Pant). Jane Smith has 1 item. Bob Taylor is in Class 6.
// Total unique students = 3. Total required uniform pieces = 4 (or more).
const mockOrderStudents: OrderStudentDetail[] = [
  {
    id: "std-1",
    studentName: "John Doe",
    admissionNumber: "ADM-101",
    className: "Class 5th",
    section: "A",
    gender: "Male",
    uniforms: [
      { itemName: "Shirt", styleName: "Regular", color: "Sky Blue", size: "28", quantity: 1 },
      { itemName: "Pant", styleName: "Formal", color: "Navy Blue", size: "26", quantity: 1 },
    ],
  },
  {
    id: "std-2",
    studentName: "Jane Smith",
    admissionNumber: "ADM-102",
    className: "Class 5th",
    section: "A",
    gender: "Female",
    uniforms: [
      { itemName: "Skirt", styleName: "Pleated", color: "Navy Blue", size: "26", quantity: 1 },
    ],
  },
  {
    id: "std-3",
    studentName: "Bob Taylor",
    admissionNumber: "ADM-201",
    className: "Class 6th",
    section: "B",
    gender: "Male",
    uniforms: [
      { itemName: "Shirt", styleName: "Regular", color: "Sky Blue", size: "30", quantity: 1 },
    ],
  },
];

// Requirement items aggregated from the order
const mockReqItems: ReqItemSnapshot[] = [
  { id: "r1", requirement_id: "req-1", class_name: "Class 5th", item_name: "Shirt", style_name: "Regular", color: "Sky Blue", size: "28", quantity: 1 },
  { id: "r2", requirement_id: "req-1", class_name: "Class 6th", item_name: "Shirt", style_name: "Regular", color: "Sky Blue", size: "30", quantity: 1 },
  { id: "r3", requirement_id: "req-1", class_name: "Class 5th", item_name: "Pant", style_name: "Formal", color: "Navy Blue", size: "26", quantity: 1 },
  { id: "r4", requirement_id: "req-1", class_name: "Class 5th", item_name: "Skirt", style_name: "Pleated", color: "Navy Blue", size: "26", quantity: 1 },
];

const mockSavedCutting: StoredCuttingItem[] = [
  { order_id: "ORD-001", item_name: "Shirt", style_name: "Regular", color: "Sky Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
  { order_id: "ORD-001", item_name: "Shirt", style_name: "Regular", color: "Sky Blue", size: "30", required_quantity: 1, cut_quantity: 1 },
  { order_id: "ORD-001", item_name: "Pant", style_name: "Formal", color: "Navy Blue", size: "26", required_quantity: 1, cut_quantity: 1 },
  { order_id: "ORD-001", item_name: "Skirt", style_name: "Pleated", color: "Navy Blue", size: "26", required_quantity: 1, cut_quantity: 1 },
];

// Execute calculation
const calcResult = calculateCuttingRequirements(
  mockReqItems,
  mockSavedCutting,
  undefined,
  mockOrderStudents,
  3
);

// TEST 1: Total Students count is exactly the count of unique students in this order (3)
// NOT the total uniform pieces (4) and NOT inflated by multiple uniform items per student
assert(
  calcResult.totalStudents === 3,
  `1. Total students = 3 (got ${calcResult.totalStudents}), not inflated by multiple items per student (4 pieces)`
);

// TEST 2: Class groupings in Class-Wise View only show classes actually in this order
assert(
  calcResult.classSummaries.length === 2,
  `2. Exactly 2 classes present in order (got ${calcResult.classSummaries.length})`
);
assert(
  calcResult.classSummaries[0].className === "Class 5th",
  `2. First class is Class 5th (got ${calcResult.classSummaries[0].className})`
);
assert(
  calcResult.classSummaries[0].studentCount === 2,
  `2. Class 5th has 2 students (got ${calcResult.classSummaries[0].studentCount})`
);
assert(
  calcResult.classSummaries[1].className === "Class 6th",
  `2. Second class is Class 6th (got ${calcResult.classSummaries[1].className})`
);
assert(
  calcResult.classSummaries[1].studentCount === 1,
  `2. Class 6th has 1 student (got ${calcResult.classSummaries[1].studentCount})`
);

// TEST 3: Student identities preserve Name, Admission No, Class, Section, Gender
const class5Students = calcResult.classSummaries[0].students;
const john = class5Students.find((s) => s.studentName === "John Doe")!;
assert(!!john, "3. John Doe found in Class 5th");
assert(john.admissionNumber === "ADM-101", "3. John Doe admission number is ADM-101");
assert(john.className === "Class 5th", "3. John Doe class is Class 5th");
assert(john.section === "A", "3. John Doe section is A");
assert(john.gender === "Male", "3. John Doe gender is Male");

// Verify strictly NO Roll Number, DOB, Parent/Guardian
assert(!("rollNumber" in john) && !("roll_number" in john), "3. Strictly NO Roll Number in student identity");
assert(!("dob" in john) && !("date_of_birth" in john), "3. Strictly NO DOB in student identity");
assert(!("parent" in john) && !("guardian" in john), "3. Strictly NO Parent/Guardian in student identity");

// TEST 4: Student uniform items display Item, Style, Color, Size, Quantity
assert(john.uniforms.length === 2, "4. John Doe has 2 uniform items");
assert(john.uniforms[0].itemName === "Shirt", "4. Item 1 is Shirt");
assert(john.uniforms[0].styleName === "Regular", "4. Style 1 is Regular");
assert(john.uniforms[0].color === "Sky Blue", "4. Color 1 is Sky Blue");
assert(john.uniforms[0].size === "28", "4. Size 1 is 28");
assert(john.uniforms[0].quantity === 1, "4. Quantity 1 is 1");

// TEST 5: Cutting requirements aggregate correctly from the student uniforms
assert(calcResult.totalRequiredPieces === 4, `5. Total required pieces = 4 (got ${calcResult.totalRequiredPieces})`);
assert(calcResult.totalCutPieces === 4, `5. Total cut pieces = 4 (got ${calcResult.totalCutPieces})`);
assert(calcResult.totalPendingPieces === 0, `5. Total pending = 0 (got ${calcResult.totalPendingPieces})`);
assert(calcResult.allRowsEntered === true, "5. All rows entered = true");

// TEST 6: Excel Export includes Total Students and Order Students sheet
const wb = buildCuttingWorkbook({
  orderNumber: "ORD-001",
  schoolName: "Delhi Public School",
  calculationResult: calcResult,
});

assert(!!wb.Sheets["Cutting Requirement"], "6. Workbook has 'Cutting Requirement' sheet");
assert(!!wb.Sheets["Order Students"], "6. Workbook has 'Order Students' sheet");

const mainSheet = wb.Sheets["Cutting Requirement"];
assert(mainSheet["D4"]?.v === "Total Students:", "6. Main sheet has 'Total Students:' label");
assert(mainSheet["E4"]?.v === "3 students", "6. Main sheet has '3 students' value");

const studentsSheet = wb.Sheets["Order Students"];
// Header at row 4
assert(studentsSheet["A4"]?.v === "Class", "6. Students sheet has Class column at A4");
assert(studentsSheet["B4"]?.v === "Section", "6. Students sheet has Section column at B4");
assert(studentsSheet["C4"]?.v === "Admission No", "6. Students sheet has Admission No column at C4");
assert(studentsSheet["D4"]?.v === "Student Name", "6. Students sheet has Student Name column at D4");
assert(studentsSheet["E4"]?.v === "Gender", "6. Students sheet has Gender column at E4");
assert(studentsSheet["F4"]?.v === "Item", "6. Students sheet has Item column at F4");
assert(studentsSheet["G4"]?.v === "Style", "6. Students sheet has Style column at G4");
assert(studentsSheet["H4"]?.v === "Color", "6. Students sheet has Color column at H4");
assert(studentsSheet["I4"]?.v === "Size", "6. Students sheet has Size column at I4");
assert(studentsSheet["J4"]?.v === "Quantity", "6. Students sheet has Quantity column at J4");

// TEST 7: Empty state when order has no requirement items
const emptyCalc = calculateCuttingRequirements([], []);
assert(emptyCalc.groups.length === 0, "7. Empty requirement yields 0 groups");
assert(emptyCalc.totalRequiredPieces === 0, "7. Empty requirement total pieces = 0");
assert(emptyCalc.allRowsEntered === false, "7. Empty groups blocks completion (allRowsEntered = false)");

// TEST 8: Missing cut quantities blocks completion
const partialCutting: StoredCuttingItem[] = [
  { order_id: "ORD-001", item_name: "Shirt", style_name: "Regular", color: "Sky Blue", size: "28", required_quantity: 1, cut_quantity: 1 },
  // size 30 not entered!
];
const partialCalc = calculateCuttingRequirements(mockReqItems, partialCutting);
assert(partialCalc.allRowsEntered === false, "8. Partial cutting blocks allRowsEntered");
assert(partialCalc.missingSizesCount === 3, `8. Flags 3 missing sizes (got ${partialCalc.missingSizesCount})`);

console.log("=========================================================================");
console.log("ALL ORDER-SPECIFIC STUDENTS & CUTTING TESTS PASSED SUCCESSFULLY! ✅");
console.log("=========================================================================");
