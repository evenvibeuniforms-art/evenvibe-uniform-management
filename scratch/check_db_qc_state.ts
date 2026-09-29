import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrder() {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("order_number", "EV-ORD-2026-AC1CD9")
    .maybeSingle();

  console.log("Order:", order, error);
  if (!order) return;

  const { data: qcRecord } = await supabase
    .from("quality_check_records")
    .select("*")
    .eq("order_id", order.id);
  console.log("QC Record:", qcRecord);

  const { data: qcItems } = await supabase
    .from("order_quality_check_items")
    .select("*")
    .eq("order_id", order.id);
  console.log("QC Items:", qcItems);

  const { data: packingItems } = await supabase
    .from("order_ironing_packing_items")
    .select("*")
    .eq("order_id", order.id)
    .eq("stage_key", "packing");
  console.log("Packing Items:", packingItems);
}

checkOrder();
