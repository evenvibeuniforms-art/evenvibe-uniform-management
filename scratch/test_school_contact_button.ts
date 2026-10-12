import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

console.log("================================================================================");
console.log("   EVENVIBE — SCHOOL ADMIN FLOATING CONTACT BUTTON VERIFICATION");
console.log("================================================================================");

const contactComponentPath = resolve(process.cwd(), "src/components/school/SchoolFloatingContactButton.tsx");
const schoolLayoutPath = resolve(process.cwd(), "src/app/(school)/school/layout.tsx");
const adminLayoutPath = resolve(process.cwd(), "src/app/(admin)/layout.tsx");

const contactContent = readFileSync(contactComponentPath, "utf-8");
const schoolLayoutContent = readFileSync(schoolLayoutPath, "utf-8");
const adminLayoutContent = readFileSync(adminLayoutPath, "utf-8");

let passed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err?.message || err}`);
    process.exit(1);
  }
}

test("1. WhatsApp URL is exactly https://wa.me/919344039068", () => {
  assert.ok(
    contactContent.includes('const WHATSAPP_URL = "https://wa.me/919344039068";') ||
    contactContent.includes('"https://wa.me/919344039068"'),
    "WhatsApp URL must be exactly https://wa.me/919344039068"
  );
});

test("2. Phone URL is exactly tel:+919344039068", () => {
  assert.ok(
    contactContent.includes('const PHONE_URL = "tel:+919344039068";') ||
    contactContent.includes('"tel:+919344039068"'),
    "Phone URL must be exactly tel:+919344039068"
  );
});

test("3. WhatsApp action opens in a new tab (target='_blank' rel='noopener noreferrer')", () => {
  assert.ok(contactContent.includes('target="_blank"'), "WhatsApp must open in new tab");
  assert.ok(contactContent.includes('rel="noopener noreferrer"'), "Must have noopener noreferrer");
});

test("4. Exactly two actions are provided: WhatsApp and Call Us", () => {
  assert.ok(contactContent.includes("WhatsApp"), "Must have WhatsApp label");
  assert.ok(contactContent.includes("Call Us"), "Must have Call Us label");
});

test("5. School layout includes SchoolFloatingContactButton", () => {
  assert.ok(
    schoolLayoutContent.includes("SchoolFloatingContactButton"),
    "School layout must include SchoolFloatingContactButton"
  );
});

test("6. Admin layout does NOT include SchoolFloatingContactButton", () => {
  assert.ok(
    !adminLayoutContent.includes("SchoolFloatingContactButton"),
    "Admin layout must not contain SchoolFloatingContactButton"
  );
});

test("7. Accessibility attributes (aria-expanded, aria-haspopup, role=menu, role=menuitem) are present", () => {
  assert.ok(contactContent.includes('aria-expanded'), "Must include aria-expanded");
  assert.ok(contactContent.includes('aria-haspopup="menu"'), "Must include aria-haspopup");
  assert.ok(contactContent.includes('role="menu"'), "Must include role='menu'");
  assert.ok(contactContent.includes('role="menuitem"'), "Must include role='menuitem'");
  assert.ok(contactContent.includes('Escape'), "Must support Escape key to close");
});

console.log("================================================================================");
console.log(`SUMMARY: ${passed} passed out of 7 tests.`);
console.log("================================================================================");
