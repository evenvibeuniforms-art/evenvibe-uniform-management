import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const parsed = dotenv.parse(envContent);

console.log("=== SUPABASE DIAGNOSTIC: ENV KEYS ===");
console.log("Keys found in .env.local:", Object.keys(parsed));

const supabaseUrl = parsed.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
// Check keys
const pubKey =
  parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey =
  parsed.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  parsed.SUPABASE_SERVICE_KEY ||
  parsed.SERVICE_ROLE_KEY;

console.log("NEXT_PUBLIC_SUPABASE_URL present?:", Boolean(supabaseUrl));
console.log("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY present?:", Boolean(pubKey));
console.log("SUPABASE_SERVICE_ROLE_KEY present?:", Boolean(serviceKey));

// Use serviceKey if available, otherwise pubKey with timeout
const keyToUse = serviceKey || pubKey;

if (!supabaseUrl || !keyToUse) {
  console.error("No valid Supabase key found to connect.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, keyToUse, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      return fetch(url, { ...options, signal: controller.signal }).finally(() =>
        clearTimeout(timeoutId)
      );
    },
  },
});

async function run() {
  const targetOrderId = "488e9aa4-f150-42ed-9269-a79578d03b9c";
  console.log("\nQuerying Order ID:", targetOrderId);
  const startTime = Date.now();
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, courier_name, tracking_number, estimated_delivery, shipped_at, delivered_at")
      .eq("id", targetOrderId)
      .maybeSingle();

    console.log(`Query finished in ${Date.now() - startTime}ms`);
    if (error) {
      console.error("Query Error:", error.message, error.code);
    } else {
      console.log("Query Result:", JSON.stringify(data, null, 2));
    }

    // Check packing records
    const { data: packing, error: packErr } = await supabase
      .from("packing_records")
      .select("id, status, remarks, total_quantity, packed_quantity")
      .eq("order_id", targetOrderId)
      .maybeSingle();

    if (packErr) {
      console.error("Packing query error:", packErr.message);
    } else {
      console.log("Packing Result:", JSON.stringify(packing, null, 2));
    }

    // Check order_status_history
    const { data: history, error: histErr } = await supabase
      .from("order_status_history")
      .select("id, status, note, created_at")
      .eq("order_id", targetOrderId)
      .order("created_at", { ascending: false });

    if (histErr) {
      console.error("History query error:", histErr.message);
    } else {
      console.log("Order Status History count:", history?.length);
      console.log("Latest history entries:", JSON.stringify(history?.slice(0, 3), null, 2));
    }
  } catch (e: unknown) {
    console.error("Fetch Exception:", e instanceof Error ? e.message : e);
  }
}

run();
