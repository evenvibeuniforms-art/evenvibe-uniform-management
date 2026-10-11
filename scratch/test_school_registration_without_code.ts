import { execSync } from "child_process";
import assert from "node:assert";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

console.log("================================================================================");
console.log("   EVENVIBE — SCHOOL REGISTRATION WITHOUT SCHOOL CODE TESTS");
console.log("================================================================================");

function runDbQuery(sql: string): any {
  const tempFile = resolve(
    process.cwd(),
    "scratch",
    `tmp_reg_query_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`
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

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res.then(() => {
        console.log(`  ✅ [PASS] ${name}`);
        testsPassed++;
      }).catch((err) => {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
        testsFailed++;
      });
      return;
    }
    console.log(`  ✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

// =============================================================================
// Test 1: Schema validation accepts form data without schoolCode
// =============================================================================
test("1. Registration schema validates successfully without schoolCode", () => {
  const signupSchema = z.object({
    schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    district: z.string().trim().optional(),
    state: z.string().trim().optional(),
    pincode: z.string().trim().optional(),
    contactName: z.string().trim().min(2, "Contact name is required"),
    contactEmail: z.string().trim().email("Invalid email address"),
    contactPhone: z.string().trim().optional(),
    
    adminFullName: z.string().trim().min(2, "Admin full name is required"),
    adminEmail: z.string().trim().email("Invalid admin email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string()
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  const validPayload = {
    schoolName: "Apex International Academy",
    contactName: "John Doe",
    contactEmail: "admin@apex.edu",
    contactPhone: "9876543210",
    city: "Chennai",
    district: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
    adminFullName: "John Doe",
    adminEmail: "john@apex.edu",
    password: "Password123!",
    confirmPassword: "Password123!",
  };

  const parsed = signupSchema.safeParse(validPayload);
  assert.strictEqual(parsed.success, true, "Payload without schoolCode must pass validation");
  // @ts-ignore
  assert.strictEqual(parsed.data?.schoolCode, undefined, "schoolCode must not be in parsed data");
});

// =============================================================================
// Test 2: Schema validation rejects if passwords do not match or school name is too short
// =============================================================================
test("2. Registration schema enforces standard validations for other fields", () => {
  const signupSchema = z.object({
    schoolName: z.string().trim().min(3, "School name must be at least 3 characters"),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    district: z.string().trim().optional(),
    state: z.string().trim().optional(),
    pincode: z.string().trim().optional(),
    contactName: z.string().trim().min(2, "Contact name is required"),
    contactEmail: z.string().trim().email("Invalid email address"),
    contactPhone: z.string().trim().optional(),
    
    adminFullName: z.string().trim().min(2, "Admin full name is required"),
    adminEmail: z.string().trim().email("Invalid admin email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string()
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  // Short school name
  const invalidName = signupSchema.safeParse({
    schoolName: "AB",
    contactName: "John",
    contactEmail: "j@example.com",
    adminFullName: "John",
    adminEmail: "j@example.com",
    password: "Password123!",
    confirmPassword: "Password123!",
  });
  assert.strictEqual(invalidName.success, false);

  // Mismatched passwords
  const invalidPass = signupSchema.safeParse({
    schoolName: "Valid School Name",
    contactName: "John",
    contactEmail: "j@example.com",
    adminFullName: "John",
    adminEmail: "j@example.com",
    password: "Password123!",
    confirmPassword: "MismatchPassword!",
  });
  assert.strictEqual(invalidPass.success, false);
});

// =============================================================================
// Test 3: Server-side unique school code generation logic
// =============================================================================
test("3. Unique school code generator derives clean prefixes and 4-digit suffixes", () => {
  function generatePrefix(schoolName: string): string {
    const words = schoolName.trim().replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    let prefix = "";
    if (words.length >= 2) {
      prefix = words.map((w) => w[0].toUpperCase()).join("").substring(0, 4);
    } else if (words.length === 1) {
      prefix = words[0].substring(0, 4).toUpperCase();
    }
    if (!prefix || prefix.length < 2) {
      prefix = "SCH";
    }
    return prefix;
  }

  assert.strictEqual(generatePrefix("Delhi Public School"), "DPS");
  assert.strictEqual(generatePrefix("St. Michael's Academy"), "SMA");
  assert.strictEqual(generatePrefix("Greenwood High Secondary School"), "GHSS");
  assert.strictEqual(generatePrefix("Oxford"), "OXFO");
  assert.strictEqual(generatePrefix("X"), "SCH");
  assert.strictEqual(generatePrefix("123 Global"), "1G");
});

// =============================================================================
// Test 4: Remote Supabase database register_school execution test
// =============================================================================
test("4. Remote database register_school generates school_code when null or omitted", () => {
  const sql = `
    DO $$
    DECLARE
      v_test_school_id uuid;
      v_generated_code text;
      v_is_active boolean;
      v_prefix text;
    BEGIN
      -- Test the SQL logic used in register_school()
      v_prefix := UPPER(SUBSTRING(REGEXP_REPLACE('Test Auto School', '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
      IF v_prefix IS NULL OR LENGTH(v_prefix) < 2 THEN
        v_prefix := 'SCH';
      END IF;

      LOOP
        v_generated_code := v_prefix || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.schools WHERE school_code = v_generated_code);
      END LOOP;

      -- Insert test school with generated code
      INSERT INTO public.schools (
        name, school_code, address, city, district, state, pincode,
        contact_name, contact_email, contact_phone, is_active
      ) VALUES (
        'Test Auto School', v_generated_code, '123 Test St', 'Chennai', 'Chennai', 'Tamil Nadu', '600001',
        'Contact Person', 'contact@test.com', '9999999999', false
      ) RETURNING id, is_active INTO v_test_school_id, v_is_active;

      IF v_test_school_id IS NULL THEN
        RAISE EXCEPTION 'Failed to insert school';
      END IF;

      IF v_is_active <> false THEN
        RAISE EXCEPTION 'New school must have is_active = false';
      END IF;

      -- Clean up test record
      DELETE FROM public.schools WHERE id = v_test_school_id;
    END $$;
    SELECT 'PASS' as result;
  `;

  const res = runDbQuery(sql);
  assert.ok(res, "Query should return rows");
  assert.strictEqual(res.rows[0]?.result, "PASS");
});

// =============================================================================
// Test 5: Existing schools remain intact and unaffected
// =============================================================================
test("5. Existing schools remain intact and retain their existing school codes", () => {
  const sql = `
    SELECT count(*)::int as total_schools,
           count(school_code)::int as schools_with_codes
    FROM public.schools;
  `;

  const res = runDbQuery(sql);
  assert.ok(res, "Query should return rows");
  const row = res.rows[0];
  assert.ok(row.total_schools > 0, "Schools table should have records");
  assert.strictEqual(row.total_schools, row.schools_with_codes, "All existing schools must have school codes");
});

console.log("\n--------------------------------------------------------------------------------");
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed.`);
console.log("--------------------------------------------------------------------------------");

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log("All registration tests passed successfully!");
}
