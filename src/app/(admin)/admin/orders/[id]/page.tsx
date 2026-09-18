import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AdminOrderDetailsView from "../views/AdminOrderDetailsView";

export const metadata = {
  title: "Order Details | EvenVibe Admin",
};

export default async function AdminOrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      *,
      schools (
        id,
        name
      ),
      requirements (
        requirement_number,
        total_students,
        regular_uniform_students,
        tshirt_uniform_students
      )
    `)
    .eq("id", id)
    .single();

  if (orderError || !order) {
    notFound();
  }

  const { data: requirementItems } = await supabase
    .from("requirement_items")
    .select("*")
    .eq("requirement_id", order.requirement_id)
    .order("class_name", { nullsFirst: true })
    .order("section_name", { nullsFirst: true })
    .order("gender", { nullsFirst: true })
    .order("item_name")
    .order("size");

  const { data: statusHistory } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  const { data: modificationHistory } = await supabase
    .from("order_modification_history")
    .select(`
      *,
      requirement_items (
        gender,
        item_name,
        class_name,
        section_name,
        size
      ),
      changed_by_profile:profiles!order_modification_history_changed_by_fkey(
        id,
        role
      )
    `)
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  return (
    <AdminOrderDetailsView
      order={order}
      requirementItems={requirementItems || []}
      statusHistory={statusHistory || []}
      modificationHistory={modificationHistory || []}
    />
  );
}
