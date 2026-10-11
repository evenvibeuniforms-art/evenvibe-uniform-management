import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

// Also check service role key if in env
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Using Supabase URL:", url);

async function main() {
  // Let's inspect recent orders
  const supabase = createClient(url, key);

  console.log("Fetching orders...");
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, order_number, status, school_id, schools(name)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (ordersErr) {
    console.error("Orders fetch error:", ordersErr);
    return;
  }

  console.log(`Found ${orders?.length || 0} orders:`);
  for (const o of orders || []) {
    console.log(`- Order #${o.order_number} (${o.id}), status: ${o.status}, school: ${(o.schools as any)?.name}`);
  }

  if (!orders || orders.length === 0) return;

  const targetOrder = orders[0];
  console.log(`\nInspecting Order #${targetOrder.order_number} (${targetOrder.id})...`);

  // Batches
  const { data: batches, error: bErr } = await supabase
    .from("order_delivery_batches")
    .select("*")
    .eq("order_id", targetOrder.id);
  console.log("order_delivery_batches:", { count: batches?.length, data: batches, error: bErr });

  // Actual items
  const { data: actuals, error: aErr } = await supabase
    .from("order_delivery_actual_items")
    .select("*")
    .eq("order_id", targetOrder.id);
  console.log("order_delivery_actual_items:", { count: actuals?.length, error: aErr });
  if (actuals && actuals.length > 0) {
    console.log("Sample actual items:", actuals.slice(0, 5));
  }
}

main().catch(console.error);
