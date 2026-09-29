import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const orderId = "6c24ca88-7bdc-4496-9328-82c520531486";
  console.log("Inspecting Order:", orderId);

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status, requirement_id")
    .eq("id", orderId)
    .single();
  console.log("Order:", order);

  const { data: prodRec } = await supabase
    .from("production_records")
    .select("*")
    .eq("order_id", orderId);
  console.log("Production Records:", prodRec);

  const { data: workflows } = await supabase
    .from("order_production_workflows")
    .select("*")
    .eq("order_id", orderId)
    .order("sequence_order", { ascending: true });
  console.log("Workflows:", workflows);

  const { data: history } = await supabase
    .from("production_stage_history")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  console.log("History:", history);
}

inspect().catch(console.error);
