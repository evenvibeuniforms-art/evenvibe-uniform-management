import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

  const supabase = createClient(url, key);

  console.log("Checking order 6c24ca88-7bdc-4496-9328-82c520531486...");
  const orderId = "6c24ca88-7bdc-4496-9328-82c520531486";

  const { data: workflows, error: wfError } = await supabase
    .from("order_production_workflows")
    .select("sequence_order, stage_key, status")
    .eq("order_id", orderId)
    .order("sequence_order");

  if (wfError) {
    console.error("Workflow fetch error:", wfError);
  } else {
    console.log("Current workflows for order:", workflows);
  }

  const { data: prodRec, error: prError } = await supabase
    .from("production_records")
    .select("id, stage, total_quantity, completed_quantity")
    .eq("order_id", orderId)
    .maybeSingle();

  if (prError) {
    console.error("Production record fetch error:", prError);
  } else {
    console.log("Current production record:", prodRec);
  }

  const { data: cuttingItems, error: cutError } = await supabase
    .from("order_cutting_items")
    .select("item_name, size, cut_quantity")
    .eq("order_id", orderId);

  if (cutError) {
    console.error("Cutting items error:", cutError);
  } else {
    console.log(`Found ${cuttingItems?.length || 0} cutting items`);
  }
}

main().catch(console.error);
