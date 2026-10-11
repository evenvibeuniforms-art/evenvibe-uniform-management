import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tejhickblsbgjawgekek.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Z6x8pT56xvA1ClZyZQI3cQ_j_gu1c5K";

const supabase = createClient(url, key);

async function check() {
  console.log("Checking if RPC exists or executing check...");
  // Let's check table grants or rpc
  const { data, error } = await supabase.rpc("exec_sql", { sql: "SELECT 1;" });
  console.log("rpc exec_sql:", { data, error });
}

check().catch(console.error);
