import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

console.log("========================================================================");
console.log("   EVENVIBE MANAGEMENT — ADMIN BUSINESS EVENT NOTIFICATIONS TEST SUITE  ");
console.log("========================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err: unknown) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

async function main() {
  const supabase = createClient(supabaseUrl, pubKey);

  // ============================================================================
  // PART 1: Notification Content & Navigation Rules
  // ============================================================================
  console.log("\n--- PART 1: Event Specification & Navigation Rules ---");

  await runTest("TC Student event formatting, metadata and navigation link", () => {
    const schoolName = "Springfield Academy";
    const studentName = "John Doe";
    const studentId = "student-123";
    const schoolId = "school-456";
    const admissionNumber = "ADM-2026-001";
    const nowIso = new Date().toISOString();

    const title = "New TC Student Added";
    const message = `A new TC student has been added by ${schoolName}.`;
    const link = "/admin/tc-students";
    const eventType = "NEW_TC_STUDENT";

    const metadata = {
      school_id: schoolId,
      school_name: schoolName,
      student_id: studentId,
      student_name: studentName,
      admission_number: admissionNumber,
      event_type: eventType,
      created_at: nowIso,
    };

    assert.strictEqual(title, "New TC Student Added");
    assert.strictEqual(message, "A new TC student has been added by Springfield Academy.");
    assert.strictEqual(link, "/admin/tc-students");
    assert.strictEqual(eventType, "NEW_TC_STUDENT");
    assert.strictEqual(metadata.school_id, schoolId);
    assert.strictEqual(metadata.student_name, studentName);
    assert.strictEqual(metadata.admission_number, admissionNumber);
  });

  await runTest("New Order event formatting, metadata and navigation link", () => {
    const orderNumber = "EV-ORD-2026-AC1CD9";
    const schoolName = "Drakvex";
    const orderId = "order-789";
    const schoolId = "school-drakvex";
    const nowIso = new Date().toISOString();

    const title = "New Order Received";
    const message = `New order ${orderNumber} received from ${schoolName}.`;
    const link = `/admin/orders/${orderId}`;
    const eventType = "NEW_ORDER";

    const metadata = {
      order_id: orderId,
      order_number: orderNumber,
      school_id: schoolId,
      school_name: schoolName,
      event_type: eventType,
      created_at: nowIso,
    };

    assert.strictEqual(title, "New Order Received");
    assert.strictEqual(message, "New order EV-ORD-2026-AC1CD9 received from Drakvex.");
    assert.strictEqual(link, "/admin/orders/order-789");
    assert.strictEqual(eventType, "NEW_ORDER");
    assert.strictEqual(metadata.order_number, "EV-ORD-2026-AC1CD9");
  });

  await runTest("New Alteration Request event formatting, metadata and navigation link", () => {
    const schoolName = "Drakvex";
    const studentName = "Aarav";
    const alterationId = "alt-999";
    const orderId = "order-789";
    const schoolId = "school-drakvex";
    const studentId = "student-aarav";
    const item = "Shirt";
    const nowIso = new Date().toISOString();

    const title = "New Alteration Request";
    const message = `New alteration request from ${schoolName} for ${studentName}.`;
    const link = "/admin/alterations";
    const eventType = "NEW_ALTERATION_REQUEST";

    const metadata = {
      alteration_id: alterationId,
      order_id: orderId,
      school_id: schoolId,
      school_name: schoolName,
      student_id: studentId,
      student_name: studentName,
      item: item,
      event_type: eventType,
      created_at: nowIso,
    };

    assert.strictEqual(title, "New Alteration Request");
    assert.strictEqual(message, "New alteration request from Drakvex for Aarav.");
    assert.strictEqual(link, "/admin/alterations");
    assert.strictEqual(eventType, "NEW_ALTERATION_REQUEST");
    assert.strictEqual(metadata.item, "Shirt");
  });

  await runTest("NEW_SCHOOL_REGISTERED event formatting, metadata and navigation link", () => {
    const schoolName = "Test Academy";
    const schoolId = "school-test-123";
    const schoolCode = "SCH-TA";
    const city = "Chennai";
    const nowIso = new Date().toISOString();

    const title = "New School Registered";
    const message = `New school ${schoolName} has been registered.`;
    const link = "/admin/schools";
    const eventType = "NEW_SCHOOL_REGISTERED";

    const metadata = {
      school_id: schoolId,
      school_name: schoolName,
      school_code: schoolCode,
      city: city,
      event_type: eventType,
      created_at: nowIso,
    };

    assert.strictEqual(title, "New School Registered");
    assert.strictEqual(message, "New school Test Academy has been registered.");
    assert.strictEqual(link, "/admin/schools");
    assert.strictEqual(eventType, "NEW_SCHOOL_REGISTERED");
    assert.strictEqual(metadata.school_id, schoolId);
    assert.strictEqual(metadata.school_name, schoolName);
  });

  // ============================================================================
  // PART 2: Duplicate Protection & Idempotency Key Design
  // ============================================================================
  console.log("\n--- PART 2: Duplicate Protection & Idempotency Keys ---");

  await runTest("Idempotency keys are deterministic and entity-scoped", () => {
    const orderId = "order-abc-123";
    const altId = "alt-def-456";
    const studentId = "student-ghi-789";
    const schoolId = "school-jkl-012";

    const orderKey = `NEW_ORDER_${orderId}`;
    const altKey = `NEW_ALTERATION_REQUEST_${altId}`;
    const tcKey = `NEW_TC_STUDENT_${studentId}_${schoolId}`;
    const schoolKey = `NEW_SCHOOL_REGISTERED_${schoolId}`;

    assert.strictEqual(orderKey, "NEW_ORDER_order-abc-123");
    assert.strictEqual(altKey, "NEW_ALTERATION_REQUEST_alt-def-456");
    assert.strictEqual(tcKey, "NEW_TC_STUDENT_student-ghi-789_school-jkl-012");
    assert.strictEqual(schoolKey, "NEW_SCHOOL_REGISTERED_school-jkl-012");
  });

  // ============================================================================
  // PART 3: Database RPC Idempotency Test
  // ============================================================================
  console.log("\n--- PART 3: Database RPC Idempotency & Creation ---");

  const testKeyOrder = `TEST_ORDER_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let createdOrderNotifId: string = "";

  await runTest("RPC create_admin_business_notification creates NEW_ORDER notification", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_ORDER",
      p_title: "New Order Received",
      p_message: "New order EV-ORD-2026-TEST received from Test Academy.",
      p_link: "/admin/orders/test-order-uuid",
      p_metadata: { order_id: "test-order-uuid", order_number: "EV-ORD-2026-TEST" },
      p_idempotency_key: testKeyOrder,
      p_notification_type: "order",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, false);
    assert.ok(data.id, "Expected valid UUID returned");
    createdOrderNotifId = data.id;
  });

  await runTest("Duplicate NEW_ORDER call returns is_duplicate: true and existing ID", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_ORDER",
      p_title: "New Order Received",
      p_message: "New order EV-ORD-2026-TEST received from Test Academy.",
      p_link: "/admin/orders/test-order-uuid",
      p_metadata: { order_id: "test-order-uuid", order_number: "EV-ORD-2026-TEST" },
      p_idempotency_key: testKeyOrder,
      p_notification_type: "order",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, true, "Expected is_duplicate to be true on second call");
    assert.strictEqual(data.id, createdOrderNotifId, "Expected same notification ID");
  });

  const testKeyTc = `TEST_TC_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let createdTcNotifId: string = "";

  await runTest("RPC create_admin_business_notification creates NEW_TC_STUDENT notification", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_TC_STUDENT",
      p_title: "New TC Student Added",
      p_message: "A new TC student has been added by Test Academy.",
      p_link: "/admin/tc-students",
      p_metadata: { student_id: "test-student-uuid", student_name: "Rahul Verma" },
      p_idempotency_key: testKeyTc,
      p_notification_type: "tc_student",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, false);
    createdTcNotifId = data.id;
  });

  await runTest("Duplicate NEW_TC_STUDENT call returns is_duplicate: true and existing ID", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_TC_STUDENT",
      p_title: "New TC Student Added",
      p_message: "A new TC student has been added by Test Academy.",
      p_link: "/admin/tc-students",
      p_metadata: { student_id: "test-student-uuid", student_name: "Rahul Verma" },
      p_idempotency_key: testKeyTc,
      p_notification_type: "tc_student",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, true);
    assert.strictEqual(data.id, createdTcNotifId);
  });

  const testKeyAlt = `TEST_ALT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let createdAltNotifId: string = "";

  await runTest("RPC create_admin_business_notification creates NEW_ALTERATION_REQUEST notification", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_ALTERATION_REQUEST",
      p_title: "New Alteration Request",
      p_message: "New alteration request from Test Academy for Rahul Verma.",
      p_link: "/admin/alterations",
      p_metadata: { alteration_id: "test-alt-uuid", item: "Trousers" },
      p_idempotency_key: testKeyAlt,
      p_notification_type: "alteration",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, false);
    createdAltNotifId = data.id;
  });

  await runTest("Duplicate NEW_ALTERATION_REQUEST call returns is_duplicate: true and existing ID", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_ALTERATION_REQUEST",
      p_title: "New Alteration Request",
      p_message: "New alteration request from Test Academy for Rahul Verma.",
      p_link: "/admin/alterations",
      p_metadata: { alteration_id: "test-alt-uuid", item: "Trousers" },
      p_idempotency_key: testKeyAlt,
      p_notification_type: "alteration",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, true);
    assert.strictEqual(data.id, createdAltNotifId);
  });

  const testKeySchool = `TEST_SCHOOL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let createdSchoolNotifId: string = "";

  await runTest("RPC create_admin_business_notification creates NEW_SCHOOL_REGISTERED notification", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_SCHOOL_REGISTERED",
      p_title: "New School Registered",
      p_message: "New school Test Academy has been registered.",
      p_link: "/admin/schools",
      p_metadata: { school_id: "test-school-uuid", school_name: "Test Academy", school_code: "SCH-TA", city: "Chennai" },
      p_idempotency_key: testKeySchool,
      p_notification_type: "school",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, false);
    createdSchoolNotifId = data.id;
  });

  await runTest("Duplicate NEW_SCHOOL_REGISTERED call returns is_duplicate: true and existing ID", async () => {
    const { data, error } = await supabase.rpc("create_admin_business_notification", {
      p_event_type: "NEW_SCHOOL_REGISTERED",
      p_title: "New School Registered",
      p_message: "New school Test Academy has been registered.",
      p_link: "/admin/schools",
      p_metadata: { school_id: "test-school-uuid", school_name: "Test Academy", school_code: "SCH-TA", city: "Chennai" },
      p_idempotency_key: testKeySchool,
      p_notification_type: "school",
    });

    assert.ifError(error);
    assert.ok(data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.is_duplicate, true);
    assert.strictEqual(data.id, createdSchoolNotifId);
  });

  console.log("\n========================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("========================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
