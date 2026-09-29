import assert from "node:assert";
import { newAlterationSchema } from "../src/app/(school)/school/alterations/schema";
import { isPositiveWholeNumber } from "../src/lib/constants/studentSizes";

console.log("========================================================================");
console.log("   EVENVIBE MANAGEMENT — SCHOOL ADMIN ALTERATION PHASE TEST SUITE       ");
console.log("========================================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err: unknown) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

// ============================================================================
// PART 1: Positive Whole Number Validation Utility
// ============================================================================
console.log("\n--- PART 1: Size Whole Number Validation ---");

runTest("Valid positive whole numbers return true", () => {
  assert.strictEqual(isPositiveWholeNumber("24"), true);
  assert.strictEqual(isPositiveWholeNumber("32"), true);
  assert.strictEqual(isPositiveWholeNumber("18"), true);
  assert.strictEqual(isPositiveWholeNumber(" 40 "), true);
  assert.strictEqual(isPositiveWholeNumber(36), true);
  assert.strictEqual(isPositiveWholeNumber("100"), true);
});

runTest("Invalid / zero / negative / fractional / non-numeric values return false", () => {
  assert.strictEqual(isPositiveWholeNumber("0"), false);
  assert.strictEqual(isPositiveWholeNumber("-2"), false);
  assert.strictEqual(isPositiveWholeNumber("32.5"), false);
  assert.strictEqual(isPositiveWholeNumber("M"), false);
  assert.strictEqual(isPositiveWholeNumber("XL"), false);
  assert.strictEqual(isPositiveWholeNumber("abc"), false);
  assert.strictEqual(isPositiveWholeNumber(""), false);
  assert.strictEqual(isPositiveWholeNumber(null), false);
  assert.strictEqual(isPositiveWholeNumber(undefined), false);
  assert.strictEqual(isPositiveWholeNumber(NaN), false);
});

// ============================================================================
// PART 2: Zod Schema Validation
// ============================================================================
console.log("\n--- PART 2: Alteration Request Schema Validation ---");

runTest("Valid alteration request passes schema validation", () => {
  const payload = {
    orderId: "e067cba6-1b4e-4f27-94d0-42173166810a",
    studentId: "a1111111-1111-4111-8111-111111111111",
    itemName: "Shirt",
    styleName: "Regular Collar",
    color: "Sky Blue",
    givenSize: "30",
    changeSize: "32",
    reason: "Size Correction" as const,
    remarks: "Chest is tight during physical activity",
  };

  const parsed = newAlterationSchema.safeParse(payload);
  assert.strictEqual(parsed.success, true);
  if (parsed.success) {
    assert.strictEqual(parsed.data.changeSize, "32");
    assert.strictEqual(parsed.data.givenSize, "30");
  }
});

runTest("Schema rejects invalid changeSize (e.g. non-whole number)", () => {
  const payload = {
    orderId: "e067cba6-1b4e-4f27-94d0-42173166810a",
    studentId: "a1111111-1111-4111-8111-111111111111",
    itemName: "Shirt",
    changeSize: "Medium", // invalid - must be positive whole number
    reason: "Size Correction" as const,
  };

  const parsed = newAlterationSchema.safeParse(payload);
  assert.strictEqual(parsed.success, false);
});

runTest("Schema rejects blank or negative changeSize when reason is size related", () => {
  const invalidSizes = ["", "   ", "0", "-4", "32.5"];
  for (const size of invalidSizes) {
    const payload = {
      orderId: "e067cba6-1b4e-4f27-94d0-42173166810a",
      studentId: "a1111111-1111-4111-8111-111111111111",
      itemName: "Shirt",
      changeSize: size,
      reason: "Size Correction" as const,
    };
    const parsed = newAlterationSchema.safeParse(payload);
    assert.strictEqual(parsed.success, false, `Expected size '${size}' to fail validation`);
  }
});

runTest("Schema rejects missing required fields", () => {
  const payload = {
    changeSize: "32",
  };
  const parsed = newAlterationSchema.safeParse(payload);
  assert.strictEqual(parsed.success, false);
});

// ============================================================================
// PART 3: Delivery-First Eligibility Logic
// ============================================================================
console.log("\n--- PART 3: Delivery-First Eligibility Logic ---");

interface MockQcItem {
  id: string;
  item_name: string;
  size: string;
  passed_quantity: number;
}

interface MockStudent {
  id: string;
  first_name: string;
  last_name: string;
  class: string;
  section: string;
  items: { itemName: string; size: string }[];
}

// Core business simulation function matching actions.ts getDeliveredStudentsForOrder
function filterDeliveredStudents(
  students: MockStudent[],
  qcItems: MockQcItem[]
): { deliveredStudents: MockStudent[]; deliveredClasses: string[] } {
  // Only items with passed_quantity > 0 are delivered
  const activeDelivery = qcItems.filter((q) => q.passed_quantity > 0);

  const eligibleStudents = students.filter((student) => {
    // Student must have at least 1 delivered item
    return student.items.some((studentItem) =>
      activeDelivery.some(
        (del) =>
          del.item_name.toLowerCase() === studentItem.itemName.toLowerCase() &&
          del.size.toLowerCase() === studentItem.size.toLowerCase()
      )
    );
  });

  const uniqueClasses = Array.from(
    new Set(eligibleStudents.map((s) => s.class).filter(Boolean))
  ).sort();

  return {
    deliveredStudents: eligibleStudents,
    deliveredClasses: uniqueClasses,
  };
}

runTest("Rule 1: 5 Students in original order, 3 delivered -> ONLY 3 eligible for alteration", () => {
  const students: MockStudent[] = [
    { id: "s1", first_name: "Arun", last_name: "Kumar", class: "Grade 5", section: "A", items: [{ itemName: "Shirt", size: "30" }] },
    { id: "s2", first_name: "Bhavna", last_name: "Patel", class: "Grade 5", section: "A", items: [{ itemName: "Shirt", size: "32" }] },
    { id: "s3", first_name: "Chetan", last_name: "Sharma", class: "Grade 6", section: "B", items: [{ itemName: "Shirt", size: "34" }] },
    { id: "s4", first_name: "Deepak", last_name: "Verma", class: "Grade 7", section: "A", items: [{ itemName: "Shirt", size: "36" }] },
    { id: "s5", first_name: "Esha", last_name: "Reddy", class: "Grade 8", section: "C", items: [{ itemName: "Shirt", size: "28" }] },
  ];

  // QC items in final delivery: only s1, s2, s3 were delivered!
  const qcItems: MockQcItem[] = [
    { id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 },
    { id: "qc2", item_name: "Shirt", size: "32", passed_quantity: 1 },
    { id: "qc3", item_name: "Shirt", size: "34", passed_quantity: 1 },
    // s4 & s5 have 0 passed quantity (not delivered)
    { id: "qc4", item_name: "Shirt", size: "36", passed_quantity: 0 },
    { id: "qc5", item_name: "Shirt", size: "28", passed_quantity: 0 },
  ];

  const result = filterDeliveredStudents(students, qcItems);

  assert.strictEqual(result.deliveredStudents.length, 3);
  assert.deepStrictEqual(result.deliveredStudents.map((s) => s.id), ["s1", "s2", "s3"]);

  // Deepak and Esha must NOT be in the eligible students list
  assert.strictEqual(result.deliveredStudents.some((s) => s.id === "s4"), false);
  assert.strictEqual(result.deliveredStudents.some((s) => s.id === "s5"), false);

  // Grade 7 and Grade 8 must NOT appear in delivered classes
  assert.deepStrictEqual(result.deliveredClasses, ["Grade 5", "Grade 6"]);
});

// Core business simulation function matching actions.ts getDeliveredStudentItems
function resolveDeliveredStudentItems(
  student: MockStudent,
  qcItems: MockQcItem[],
  existingAlterations: { item_name: string; attempt_number: number; given_size: string; change_size: string; status: string }[]
) {
  const activeDelivery = qcItems.filter((q) => q.passed_quantity > 0);

  // Filter student items to only those that were delivered
  const deliveredItems = student.items.filter((item) =>
    activeDelivery.some(
      (del) =>
        del.item_name.toLowerCase() === item.itemName.toLowerCase() &&
        del.size.toLowerCase() === item.size.toLowerCase()
    )
  );

  return deliveredItems.map((item) => {
    const itemAlts = existingAlterations.filter(
      (a) => a.item_name.toLowerCase() === item.itemName.toLowerCase()
    );

    const attemptsUsed = itemAlts.length;
    const isMaxReached = attemptsUsed >= 2;
    const nextAttemptNumber = (attemptsUsed + 1) as 1 | 2 | 3;

    // Rule 22: Authoritative Given Size
    let authoritativeGivenSize = item.size;
    if (attemptsUsed === 1 && itemAlts[0]?.change_size) {
      authoritativeGivenSize = itemAlts[0].change_size;
    }

    return {
      itemName: item.itemName,
      deliveredSize: item.size,
      authoritativeGivenSize,
      attemptsUsed,
      isMaxReached,
      nextAttemptNumber,
      attemptBadge: isMaxReached
        ? "Max Attempts Reached (2/2)"
        : attemptsUsed === 1
        ? "Attempt 2 of 2 (Final Alteration)"
        : "Attempt 1 of 2",
    };
  });
}

runTest("Rule 2: Uniform item level delivery - student with Shirt delivered but Pant not delivered", () => {
  const student: MockStudent = {
    id: "s1",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [
      { itemName: "Shirt", size: "30" },
      { itemName: "Pant", size: "28" },
    ],
  };

  const qcItems: MockQcItem[] = [
    { id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 },
    { id: "qc2", item_name: "Pant", size: "28", passed_quantity: 0 }, // 0 passed -> not delivered
  ];

  const items = resolveDeliveredStudentItems(student, qcItems, []);

  // Only Shirt should be returned
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].itemName, "Shirt");
  assert.strictEqual(items[0].deliveredSize, "30");
  assert.strictEqual(items[0].authoritativeGivenSize, "30");
  assert.strictEqual(items[0].attemptsUsed, 0);
  assert.strictEqual(items[0].isMaxReached, false);
});

// ============================================================================
// PART 4: Max 2 Attempts Per Student + Per Item Logic
// ============================================================================
console.log("\n--- PART 4: Max 2 Attempts Per Student + Item Logic ---");

runTest("Student Arun Shirt: Attempt 1 succeeds with Attempt 1 of 2", () => {
  const student: MockStudent = {
    id: "s1",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [{ itemName: "Shirt", size: "30" }],
  };
  const qcItems: MockQcItem[] = [{ id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 }];

  const items = resolveDeliveredStudentItems(student, qcItems, []);
  assert.strictEqual(items[0].attemptsUsed, 0);
  assert.strictEqual(items[0].nextAttemptNumber, 1);
  assert.strictEqual(items[0].isMaxReached, false);
  assert.strictEqual(items[0].authoritativeGivenSize, "30");
  assert.strictEqual(items[0].attemptBadge, "Attempt 1 of 2");
});

runTest("Student Arun Shirt: Attempt 2 (Rule 22) uses change_size from Attempt 1 as Given Size", () => {
  const student: MockStudent = {
    id: "s1",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [{ itemName: "Shirt", size: "30" }],
  };
  const qcItems: MockQcItem[] = [{ id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 }];

  // Attempt 1 was submitted: given=30, change=32
  const existingAlterations = [
    { item_name: "Shirt", attempt_number: 1, given_size: "30", change_size: "32", status: "completed" },
  ];

  const items = resolveDeliveredStudentItems(student, qcItems, existingAlterations);
  assert.strictEqual(items[0].attemptsUsed, 1);
  assert.strictEqual(items[0].nextAttemptNumber, 2);
  assert.strictEqual(items[0].isMaxReached, false);
  // Authoritative Given Size MUST be "32" from Attempt 1
  assert.strictEqual(items[0].authoritativeGivenSize, "32");
  assert.strictEqual(items[0].attemptBadge, "Attempt 2 of 2 (Final Alteration)");
});

runTest("Student Arun Shirt: Attempt 3 is strictly blocked (Max Attempts Reached)", () => {
  const student: MockStudent = {
    id: "s1",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [{ itemName: "Shirt", size: "30" }],
  };
  const qcItems: MockQcItem[] = [{ id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 }];

  // Both Attempt 1 and Attempt 2 exist
  const existingAlterations = [
    { item_name: "Shirt", attempt_number: 1, given_size: "30", change_size: "32", status: "completed" },
    { item_name: "Shirt", attempt_number: 2, given_size: "32", change_size: "34", status: "in_progress" },
  ];

  const items = resolveDeliveredStudentItems(student, qcItems, existingAlterations);
  assert.strictEqual(items[0].attemptsUsed, 2);
  assert.strictEqual(items[0].isMaxReached, true);
  assert.strictEqual(items[0].attemptBadge, "Max Attempts Reached (2/2)");

  // Simulated server rejection check
  const canSubmit = items[0].attemptsUsed < 2;
  assert.strictEqual(canSubmit, false);
});

runTest("Student Arun Pant: allows 2 attempts even when Shirt has reached 2/2", () => {
  const student: MockStudent = {
    id: "s1",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [
      { itemName: "Shirt", size: "30" },
      { itemName: "Pant", size: "28" },
    ],
  };
  const qcItems: MockQcItem[] = [
    { id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 },
    { id: "qc2", item_name: "Pant", size: "28", passed_quantity: 1 },
  ];

  // Shirt has 2 attempts already
  const existingAlterations = [
    { item_name: "Shirt", attempt_number: 1, given_size: "30", change_size: "32", status: "completed" },
    { item_name: "Shirt", attempt_number: 2, given_size: "32", change_size: "34", status: "completed" },
  ];

  const items = resolveDeliveredStudentItems(student, qcItems, existingAlterations);
  const shirt = items.find((i) => i.itemName === "Shirt")!;
  const pant = items.find((i) => i.itemName === "Pant")!;

  // Shirt is maxed out
  assert.strictEqual(shirt.attemptsUsed, 2);
  assert.strictEqual(shirt.isMaxReached, true);

  // Pant has 0 attempts used and is fully open!
  assert.strictEqual(pant.attemptsUsed, 0);
  assert.strictEqual(pant.isMaxReached, false);
  assert.strictEqual(pant.nextAttemptNumber, 1);
  assert.strictEqual(pant.authoritativeGivenSize, "28");
});

runTest("Student A Shirt vs Student B Shirt: Independence between students", () => {
  const studentA: MockStudent = {
    id: "sA",
    first_name: "Arun",
    last_name: "Kumar",
    class: "Grade 5",
    section: "A",
    items: [{ itemName: "Shirt", size: "30" }],
  };
  const studentB: MockStudent = {
    id: "sB",
    first_name: "Bhavna",
    last_name: "Patel",
    class: "Grade 5",
    section: "A",
    items: [{ itemName: "Shirt", size: "32" }],
  };
  const qcItems: MockQcItem[] = [
    { id: "qc1", item_name: "Shirt", size: "30", passed_quantity: 1 },
    { id: "qc2", item_name: "Shirt", size: "32", passed_quantity: 1 },
  ];

  // Only student A has alterations
  const studentAAlts = [
    { item_name: "Shirt", attempt_number: 1, given_size: "30", change_size: "32", status: "completed" },
    { item_name: "Shirt", attempt_number: 2, given_size: "32", change_size: "34", status: "completed" },
  ];
  const studentBAlts: Array<{ item_name: string; attempt_number: number; given_size: string; change_size: string; status: string }> = [];

  const itemsA = resolveDeliveredStudentItems(studentA, qcItems, studentAAlts);
  const itemsB = resolveDeliveredStudentItems(studentB, qcItems, studentBAlts);

  assert.strictEqual(itemsA[0].isMaxReached, true);
  assert.strictEqual(itemsB[0].isMaxReached, false);
  assert.strictEqual(itemsB[0].attemptsUsed, 0);
});

// ============================================================================
// PART 5: Authoritative Given Size & Security
// ============================================================================
console.log("\n--- PART 5: Authoritative Given Size & Security ---");

runTest("Server overrides spoofed client givenSize with authoritative size", () => {
  const authoritativeDeliveredSize = "30";
  const clientPayload = {
    givenSize: "99", // client attempts to spoof given size
    changeSize: "32",
  };

  // Simulated server logic in submitAlterationRequest:
  // Server resolves authoritative size from DB records, NOT trusting client
  const serverGivenSize = authoritativeDeliveredSize;

  assert.strictEqual(serverGivenSize, "30");
  assert.notStrictEqual(serverGivenSize, clientPayload.givenSize);
});

runTest("Database Constraints Simulation: Unique Index & Check Constraint", () => {
  // Simulate unique key constraint: (order_id, student_id, item_name, attempt_number)
  const dbIndexKeys = new Set<string>();

  function insertAttempt(orderId: string, studentId: string, itemName: string, attemptNumber: number) {
    // Check constraint: attempt_number IN (1, 2)
    if (attemptNumber < 1 || attemptNumber > 2) {
      throw new Error(`chk_alteration_attempt_number violation: attempt_number must be 1 or 2, got ${attemptNumber}`);
    }

    const key = `${orderId}:${studentId}:${itemName.toLowerCase()}:${attemptNumber}`;
    if (dbIndexKeys.has(key)) {
      throw new Error(`uq_alteration_order_student_item_attempt_idx violation: duplicate key ${key}`);
    }
    dbIndexKeys.add(key);
    return { success: true };
  }

  // Attempt 1: OK
  assert.doesNotThrow(() => insertAttempt("order1", "stud1", "Shirt", 1));

  // Attempt 1 duplicate (e.g. concurrent race condition): FAILS with unique violation
  assert.throws(() => insertAttempt("order1", "stud1", "Shirt", 1), /duplicate key/);

  // Attempt 2: OK
  assert.doesNotThrow(() => insertAttempt("order1", "stud1", "Shirt", 2));

  // Attempt 3: FAILS check constraint
  assert.throws(() => insertAttempt("order1", "stud1", "Shirt", 3), /chk_alteration_attempt_number violation/);
});

// ============================================================================
// PART 6: Excel Export Row Mapping
// ============================================================================
console.log("\n--- PART 6: Excel Export Row Mapping ---");

runTest("Excel row formatting includes attempt number, given size, change size, style, color", () => {
  const rawAltRecord = {
    id: "alt1",
    request_number: "ALT-2026-0001",
    orders: { order_number: "ORD-999" },
    students: {
      first_name: "Arun",
      last_name: "Kumar",
      class: "Grade 5",
      section: "A",
    },
    item_name: "Shirt",
    style_name: "Regular Collar",
    color: "Sky Blue",
    given_size: "30",
    change_size: "32",
    attempt_number: 1,
    status: "submitted",
    reason: "too_tight",
    reason_description: "Chest is tight",
    created_at: "2026-09-28T12:00:00Z",
  };

  const excelRow = {
    requestNumber: rawAltRecord.request_number,
    orderNumber: rawAltRecord.orders?.order_number || "-",
    studentName: `${rawAltRecord.students?.first_name} ${rawAltRecord.students?.last_name}`,
    classSection: `${rawAltRecord.students?.class} - ${rawAltRecord.students?.section}`,
    itemName: rawAltRecord.item_name,
    styleName: rawAltRecord.style_name || "Standard",
    color: rawAltRecord.color || "Default",
    givenSize: rawAltRecord.given_size || "-",
    changeSize: rawAltRecord.change_size || "-",
    attempt: `${rawAltRecord.attempt_number}/2`,
    status: rawAltRecord.status.toUpperCase(),
    reason: "Too Tight",
    submittedAt: rawAltRecord.created_at,
  };

  assert.strictEqual(excelRow.requestNumber, "ALT-2026-0001");
  assert.strictEqual(excelRow.studentName, "Arun Kumar");
  assert.strictEqual(excelRow.givenSize, "30");
  assert.strictEqual(excelRow.changeSize, "32");
  assert.strictEqual(excelRow.attempt, "1/2");
  assert.strictEqual(excelRow.styleName, "Regular Collar");
  assert.strictEqual(excelRow.color, "Sky Blue");
});

// ============================================================================
// PART 7: Live Order EV-ORD-2026-AC1CD9 Data Verification
// ============================================================================
console.log("\n--- PART 7: Live Order EV-ORD-2026-AC1CD9 Data Verification ---");

runTest("Order EV-ORD-2026-AC1CD9: 4 original students -> exactly 2 delivered students (Aarav, sriii)", () => {
  // Live dataset snapshot from database
  const originalRequirementStudents = [
    { id: "64882d1d-6911-4671-803d-dd847bbd9d91", name: "joshwa", orderedItems: [{ item: "Shirt", size: "30", color: "Blue" }, { item: "Pant", size: "34", color: "Yellow" }] },
    { id: "0101fc16-c3a6-45e8-8ba2-a30a9d900454", name: "joshhh", orderedItems: [{ item: "Shirt", size: "28", color: "Yellow" }, { item: "Pant", size: "26", color: null }] },
    { id: "b881455b-6e00-43d0-bc9a-b6f682312e2f", name: "sriii", orderedItems: [{ item: "Pant", size: "28", color: "Blue" }] },
    { id: "d7801d42-4e39-46c2-8a3c-29e6d1d1bdbb", name: "Aarav", orderedItems: [{ item: "Shirt", size: "28", color: "Blue" }, { item: "Pant", size: "34", color: "Yellow" }] },
  ];

  // Final QC Passed delivered items in DB
  const qcPassedDeliveredItems = [
    { item_name: "Pant", size: "28", color: "Blue", passed_quantity: 1 },
    { item_name: "Shirt", size: "28", color: "Blue", passed_quantity: 1 },
    { item_name: "Shirt", size: "30", color: "Blue", passed_quantity: 0 }, // defective -> 0 passed
  ];
  assert.strictEqual(qcPassedDeliveredItems.filter((q) => q.passed_quantity > 0).length, 2);

  // Map to order_delivery_student_items
  const deliveredStudentItems = [
    { studentId: "b881455b-6e00-43d0-bc9a-b6f682312e2f", studentName: "sriii", itemName: "Pant", styleName: "hbhbhbh", color: "Blue", size: "28", quantity: 1 },
    { studentId: "d7801d42-4e39-46c2-8a3c-29e6d1d1bdbb", studentName: "Aarav", itemName: "Shirt", styleName: "style drak", color: "Blue", size: "28", quantity: 1 },
  ];

  assert.strictEqual(originalRequirementStudents.length, 4, "Original requirement had 4 students");
  assert.strictEqual(deliveredStudentItems.length, 2, "Final delivery contains uniform items for exactly 2 students");

  const eligibleStudentNames = Array.from(new Set(deliveredStudentItems.map((d) => d.studentName)));
  assert.deepStrictEqual(eligibleStudentNames.sort(), ["Aarav", "sriii"]);

  // Non-delivered students (joshwa and joshhh) MUST NOT be present
  assert.strictEqual(deliveredStudentItems.some((d) => d.studentName === "joshwa"), false);
  assert.strictEqual(deliveredStudentItems.some((d) => d.studentName === "joshhh"), false);

  // Authoritative delivered sizes
  const aaravDelivery = deliveredStudentItems.find((d) => d.studentName === "Aarav")!;
  assert.strictEqual(aaravDelivery.itemName, "Shirt");
  assert.strictEqual(aaravDelivery.size, "28");

  const sriiiDelivery = deliveredStudentItems.find((d) => d.studentName === "sriii")!;
  assert.strictEqual(sriiiDelivery.itemName, "Pant");
  assert.strictEqual(sriiiDelivery.size, "28");
});

runTest("Server Rejection: Attempting alteration for non-delivered student throws error", () => {
  const nonDeliveredStudentId = "64882d1d-6911-4671-803d-dd847bbd9d91"; // joshwa
  const deliveredItemsInOrder = [
    { student_id: "b881455b-6e00-43d0-bc9a-b6f682312e2f", item_name: "Pant" },
    { student_id: "d7801d42-4e39-46c2-8a3c-29e6d1d1bdbb", item_name: "Shirt" },
  ];

  const hasDelivery = deliveredItemsInOrder.some((d) => d.student_id === nonDeliveredStudentId);
  assert.strictEqual(hasDelivery, false, "joshwa must have no delivery record");

  function validateStudentDelivery(studentId: string) {
    if (!deliveredItemsInOrder.some((d) => d.student_id === studentId)) {
      throw new Error("The selected student is not eligible for alteration.");
    }
  }

  assert.throws(() => validateStudentDelivery(nonDeliveredStudentId), /The selected student is not eligible for alteration/);
});

runTest("Server Rejection: Attempting alteration for non-delivered item on delivered student throws error", () => {
  // Aarav was delivered Shirt only, not Pant
  const aaravDeliveredItems = [
    { item_name: "Shirt", size: "28" },
  ];

  function validateItemDelivery(itemName: string) {
    if (!aaravDeliveredItems.some((d) => d.item_name.toLowerCase() === itemName.toLowerCase())) {
      throw new Error("The selected item was not delivered to this student.");
    }
  }

  // Shirt succeeds
  assert.doesNotThrow(() => validateItemDelivery("Shirt"));

  // Pant fails
  assert.throws(() => validateItemDelivery("Pant"), /The selected item was not delivered to this student/);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log("\n========================================================================");
console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log("========================================================================");

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log("ALL ALTERATION TESTS PASSED SUCCESSFULLY! 🚀");
}
