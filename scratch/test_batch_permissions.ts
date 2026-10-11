import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

const supabase = createClient(url, key);

async function main() {
  console.log("Checking order_delivery_batches query with anon/publishable key...");
  const res1 = await supabase.from("order_delivery_batches").select("*").limit(5);
  console.log("order_delivery_batches result:", {
    data: res1.data,
    error: res1.error ? { code: res1.error.code, message: res1.error.message, details: res1.error.details, hint: res1.error.hint } : null,
  });

  console.log("Checking order_delivery_actual_items query with anon/publishable key...");
  const res2 = await supabase.from("order_delivery_actual_items").select("*").limit(5);
  console.log("order_delivery_actual_items result:", {
    data: res2.data,
    error: res2.error ? { code: res2.error.code, message: res2.error.message, details: res2.error.details, hint: res2.error.hint } : null,
  });

  console.log("Checking order_delivery_returns query with anon/publishable key...");
  const res3 = await supabase.from("order_delivery_returns").select("*").limit(5);
  console.log("order_delivery_returns result:", {
    data: res3.data,
    error: res3.error ? { code: res3.error.code, message: res3.error.message, details: res3.error.details, hint: res3.error.hint } : null,
  });

  console.log("Checking order_followup_dispatches query with anon/publishable key...");
  const res4 = await supabase.from("order_followup_dispatches").select("*").limit(5);
  console.log("order_followup_dispatches result:", {
    data: res4.data,
    error: res4.error ? { code: res4.error.code, message: res4.error.message, details: res4.error.details, hint: res4.error.hint } : null,
  });
}

main().catch(console.error);
