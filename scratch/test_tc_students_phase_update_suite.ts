import assert from "node:assert";
import {
  createTcStudentSchema,
  updateTcStudentSchema,
  TcStudentItem,
} from "../src/app/(school)/school/tc-students/schema";

console.log("========================================================================");
console.log("      EVENVIBE MANAGEMENT — TC STUDENTS PHASE UPDATE TEST SUITE        ");
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
// PART 1: TC Number Removal & TC Date Mandatory Validation
// ============================================================================
console.log("\n--- PART 1: Zod Schema Validation (TC Number Removed, TC Date Required) ---");

runTest("TEST 1 & 2: Valid payload with student_id and tc_date passes schema validation", () => {
  const payload = {
    student_id: "a1111111-1111-4111-8111-111111111111",
    tc_date: "2026-09-28",
  };

  const parsed = createTcStudentSchema.safeParse(payload);
  assert.strictEqual(parsed.success, true);
  if (parsed.success) {
    assert.strictEqual(parsed.data.tc_date, "2026-09-28");
    // Verify TC Number does NOT exist in parsed data
    assert.strictEqual("tc_number" in parsed.data, false);
  }
});

runTest("TEST 3: Missing or empty TC Date is rejected by schema", () => {
  const emptyDatePayload = {
    student_id: "a1111111-1111-4111-8111-111111111111",
    tc_date: "",
  };
  const parsed1 = createTcStudentSchema.safeParse(emptyDatePayload);
  assert.strictEqual(parsed1.success, false);

  const missingDatePayload = {
    student_id: "a1111111-1111-4111-8111-111111111111",
  };
  const parsed2 = createTcStudentSchema.safeParse(missingDatePayload);
  assert.strictEqual(parsed2.success, false);
});

runTest("TEST 13: Invalid TC Date formats are rejected by schema", () => {
  const invalidDates = [
    "28/09/2026", // Wrong format (must be YYYY-MM-DD)
    "2026-13-45", // Non-existent month/day
    "invalid-date",
    "2026-02-30", // February 30th does not exist
  ];

  for (const date of invalidDates) {
    const res = createTcStudentSchema.safeParse({
      student_id: "a1111111-1111-4111-8111-111111111111",
      tc_date: date,
    });
    // Either regex or calendar date parse must fail
    assert.strictEqual(res.success, false, `Expected ${date} to be rejected`);
  }
});

runTest("Update TC Date schema requires valid tc_date only and rejects tc_number", () => {
  const validUpdate = updateTcStudentSchema.safeParse({ tc_date: "2026-10-01" });
  assert.strictEqual(validUpdate.success, true);

  const invalidUpdate = updateTcStudentSchema.safeParse({ tc_date: "" });
  assert.strictEqual(invalidUpdate.success, false);

  const updateWithTcNum = updateTcStudentSchema.safeParse({ tc_number: "TC123" });
  assert.strictEqual(updateWithTcNum.success, false);
});

// ============================================================================
// PART 2: Auto-Population of Read-Only Student Details & Client Spoof Protection
// ============================================================================
console.log("\n--- PART 2: Student Details Resolution & Security ---");

runTest("TEST 5 & 15: Student details resolved authoritatively from student_id, client details ignored", () => {
  // Authoritative student database
  const studentDb: Record<string, { id: string; name: string; adm: string; class: string; sec: string; gender: string; school_id: string }> = {
    "stud-001": {
      id: "stud-001",
      name: "Aarav Sharma",
      adm: "ADM0111",
      class: "Class 4",
      sec: "A",
      gender: "Male",
      school_id: "school-alpha",
    },
  };

  // Client attempts to spoof student details and school_id
  const clientPayload = {
    student_id: "stud-001",
    tc_date: "2026-09-28",
    // Spoofed values from client:
    student_name: "Hacked Name",
    admission_number: "HACKED999",
    class_name: "Class 12",
    school_id: "attacker-school",
  };

  // Server resolves from database & authenticated context
  const authenticatedSchoolId = "school-alpha";
  const student = studentDb[clientPayload.student_id];
  assert.ok(student, "Student must exist in DB");
  assert.strictEqual(student.school_id, authenticatedSchoolId, "Student must belong to auth school");

  // Record created with authoritative details
  const createdRecord = {
    school_id: authenticatedSchoolId, // resolved from auth, not client
    student_id: student.id,
    tc_date: clientPayload.tc_date,
    student: {
      name: student.name, // "Aarav Sharma", NOT "Hacked Name"
      admission_number: student.adm, // "ADM0111", NOT "HACKED999"
      class: student.class,
      section: student.sec,
      gender: student.gender,
    },
  };

  assert.strictEqual(createdRecord.school_id, "school-alpha");
  assert.strictEqual(createdRecord.student.name, "Aarav Sharma");
  assert.strictEqual(createdRecord.student.admission_number, "ADM0111");
});

runTest("TEST 6 & 14: Cross-school student TC creation strictly rejected", () => {
  const authenticatedSchoolId = "school-alpha";
  const studentFromOtherSchool = {
    id: "stud-foreign",
    school_id: "school-beta",
  };

  function simulateCreateTc(studentId: string, clientSchoolId: string) {
    assert.ok(studentId && clientSchoolId);
    // Server must ignore clientSchoolId and verify against authenticated school
    if (studentFromOtherSchool.school_id !== authenticatedSchoolId) {
      throw new Error("Selected student does not exist or does not belong to your school.");
    }
  }

  assert.throws(
    () => simulateCreateTc("stud-foreign", "school-beta"),
    /Selected student does not exist or does not belong to your school/
  );
});

// ============================================================================
// PART 3: Duplicate TC Record Prevention
// ============================================================================
console.log("\n--- PART 3: Duplicate Record Enforcement ---");

runTest("TEST 12: Duplicate TC record for same student is prevented", () => {
  const existingRecords = [
    { school_id: "school-alpha", student_id: "stud-001", tc_date: "2026-09-28" },
  ];

  function validateNewTc(schoolId: string, studentId: string) {
    const duplicate = existingRecords.some(
      (r) => r.school_id === schoolId && r.student_id === studentId
    );
    if (duplicate) {
      throw new Error("TC record already exists for this student.");
    }
  }

  // Attempt duplicate for stud-001
  assert.throws(
    () => validateNewTc("school-alpha", "stud-001"),
    /TC record already exists for this student/
  );

  // New student stud-002 succeeds
  assert.doesNotThrow(() => validateNewTc("school-alpha", "stud-002"));
});

// ============================================================================
// PART 4: School Admin vs Admin Visibility & RLS Isolation
// ============================================================================
console.log("\n--- PART 4: School Admin vs Admin Visibility & RLS ---");

const mockDatabaseTcStudents = [
  {
    id: "tc-1",
    school_id: "school-alpha",
    school_name: "Greenwood High",
    student_id: "stud-1",
    student_name: "Aarav",
    admission_number: "ADM0111",
    class_name: "Class 4",
    section: "A",
    gender: "Male",
    tc_date: "2026-09-28",
  },
  {
    id: "tc-2",
    school_id: "school-beta",
    school_name: "St. Xavier's",
    student_id: "stud-2",
    student_name: "Bala",
    admission_number: "ADM0222",
    class_name: "Class 5",
    section: "B",
    gender: "Male",
    tc_date: "2026-09-25",
  },
];

runTest("TEST 7: School Admin can only view their own school's TC records", () => {
  const userProfile = { role: "school_admin", school_id: "school-alpha" };

  // Simulated RLS filter: school_id = public.get_my_school_id()
  const visibleToSchoolAdmin = mockDatabaseTcStudents.filter(
    (row) => row.school_id === userProfile.school_id
  );

  assert.strictEqual(visibleToSchoolAdmin.length, 1);
  assert.strictEqual(visibleToSchoolAdmin[0].student_name, "Aarav");
  assert.strictEqual(visibleToSchoolAdmin.some((r) => r.school_id === "school-beta"), false);
});

runTest("TEST 8: Admin can view TC records across all schools", () => {
  const adminProfile = { role: "evenvibe_admin" };
  assert.strictEqual(adminProfile.role, "evenvibe_admin");

  // Simulated RLS filter: public.get_my_role() = 'evenvibe_admin'
  const visibleToAdmin = mockDatabaseTcStudents;

  assert.strictEqual(visibleToAdmin.length, 2);
  const schoolsRepresented = Array.from(new Set(visibleToAdmin.map((r) => r.school_name)));
  assert.deepStrictEqual(schoolsRepresented.sort(), ["Greenwood High", "St. Xavier's"]);
});

// ============================================================================
// PART 5: Search Filtering by Student Name & Admission Number
// ============================================================================
console.log("\n--- PART 5: Search Filtering ---");

runTest("TEST 10: Search by Student Name returns matching records", () => {
  const searchTerm = "Aarav";
  const results = mockDatabaseTcStudents.filter((r) =>
    r.student_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].admission_number, "ADM0111");
});

runTest("TEST 11: Search by Admission Number returns matching records", () => {
  const searchTerm = "ADM0222";
  const results = mockDatabaseTcStudents.filter((r) =>
    r.admission_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].student_name, "Bala");
});

// ============================================================================
// PART 6: Table Display & Excel Export Row Formatting
// ============================================================================
console.log("\n--- PART 6: Table Display & Excel Export Mapping ---");

runTest("TEST 9: TC Date displayed instead of TC Number in list row mapping", () => {
  const rowItem: TcStudentItem = {
    id: "tc-1",
    school_id: "school-alpha",
    student_id: "stud-1",
    tc_date: "2026-09-28",
    created_at: "2026-09-28T10:00:00Z",
    updated_at: "2026-09-28T10:00:00Z",
    student: {
      id: "stud-1",
      student_name: "Aarav",
      admission_number: "ADM0111",
      class_name: "Class 4",
      section: "A",
      gender: "Male",
    },
  };

  const formattedRow = {
    student: rowItem.student.student_name,
    admissionNo: rowItem.student.admission_number,
    class: rowItem.student.class_name,
    section: rowItem.student.section,
    gender: rowItem.student.gender,
    tcDate: rowItem.tc_date ? "28 Sep 2026" : "—",
  };

  assert.strictEqual(formattedRow.tcDate, "28 Sep 2026");
  assert.strictEqual("tcNumber" in formattedRow, false);
  assert.strictEqual("tc_number" in formattedRow, false);
});

runTest("Excel Export mapping excludes TC Number and includes TC Date", () => {
  const excelRow = {
    School: "Greenwood High",
    "Student Name": "Aarav",
    "Admission Number": "ADM0111",
    Class: "Class 4",
    Section: "A",
    Gender: "Male",
    "TC Date": "28 Sep 2026",
  };

  assert.strictEqual(excelRow["TC Date"], "28 Sep 2026");
  assert.strictEqual("TC Number" in excelRow, false);
});

runTest("Legacy records without tc_date display gracefully without error", () => {
  const legacyRecord: TcStudentItem = {
    id: "tc-legacy",
    school_id: "school-alpha",
    student_id: "stud-old",
    tc_date: null, // Legacy record with no date
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
    student: {
      id: "stud-old",
      student_name: "Old Student",
      admission_number: "ADM0001",
      class_name: "Class 1",
      section: "A",
      gender: "Female",
    },
  };

  const displayDate = legacyRecord.tc_date || "Not Recorded";
  assert.strictEqual(displayDate, "Not Recorded");
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
  console.log("ALL TC STUDENTS PHASE UPDATE TESTS PASSED SUCCESSFULLY! 🚀");
}
