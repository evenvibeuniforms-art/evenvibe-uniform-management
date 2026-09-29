import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AdminQualityCheckDetailsView from "../views/AdminQualityCheckDetailsView";
import { StoredPackingOutputItem, StoredQCItem } from "@/lib/qualityCheck/qualityCheckEngine";

export const metadata = {
  title: "Quality Check Workspace | EvenVibe Admin",
};

export default async function AdminQualityCheckDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch Order scoped strictly to this order ID
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      updated_at,
      school_id,
      schools (
        id,
        name
      )
    `)
    .eq("id", id)
    .single();

  if (orderErr || !order) {
    notFound();
  }

  // 2. Fetch authoritative Stage 8 Packing Output for the current order ONLY
  // QC input comes strictly from order_ironing_packing_items (stage_key = 'packing')
  const [
    { data: rawPackingItems },
    { data: rawQcItems },
    { data: qcRecord },
    { data: rawQcHistory },
  ] = await Promise.all([
    supabase
      .from("order_ironing_packing_items")
      .select("*")
      .eq("order_id", id)
      .eq("stage_key", "packing"),
    supabase
      .from("order_quality_check_items")
      .select("*")
      .eq("order_id", id),
    supabase
      .from("quality_check_records")
      .select("*")
      .eq("order_id", id)
      .maybeSingle(),
    supabase
      .from("quality_check_history")
      .select(`
        id,
        quality_check_id,
        order_id,
        from_status,
        to_status,
        note,
        created_at,
        changed_by,
        profiles:changed_by (
          id,
          full_name,
          role
        )
      `)
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const packingItems: StoredPackingOutputItem[] = (rawPackingItems || []).map((p) => ({
    id: p.id,
    order_id: p.order_id,
    stage_key: "packing",
    item_name: p.item_name,
    style_id: p.style_id,
    style_name: p.style_name,
    color: p.color,
    size: p.size,
    input_quantity: p.input_quantity,
    actual_quantity: p.actual_quantity || 0,
    pending_quantity: p.pending_quantity || 0,
    remarks: p.remarks,
    status: p.status,
  }));

  const qcItems: StoredQCItem[] = (rawQcItems || []).map((q) => ({
    id: q.id,
    order_id: q.order_id,
    item_name: q.item_name,
    style_id: q.style_id,
    style_name: q.style_name,
    color: q.color,
    size: q.size,
    packed_quantity: q.packed_quantity || 0,
    passed_quantity: q.passed_quantity,
    defective_quantity: q.defective_quantity || 0,
    remarks: q.remarks,
    status: q.status,
    created_at: q.created_at,
    updated_at: q.updated_at,
  }));

  const schoolData = Array.isArray(order.schools)
    ? order.schools[0]
    : order.schools;

  const qcHistory = (rawQcHistory || []).map((h: Record<string, unknown>) => {
    const prof = Array.isArray(h.profiles) ? (h.profiles[0] as { id?: string; full_name?: string | null; role?: string } | null) : (h.profiles as { id?: string; full_name?: string | null; role?: string } | null);
    return {
      id: h.id as string,
      quality_check_id: h.quality_check_id as string,
      order_id: h.order_id as string,
      from_status: h.from_status as string,
      to_status: h.to_status as string,
      note: (h.note as string | null) ?? null,
      created_by: (h.created_by as string | null) ?? null,
      created_at: h.created_at as string,
      changed_by: (h.changed_by as string) || "",
      profiles: prof ? { id: prof.id || "", full_name: prof.full_name || null, role: prof.role || "" } : null,
      creator_name: prof?.full_name || "Admin",
    };
  });

  return (
    <AdminQualityCheckDetailsView
      order={{
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        schools: schoolData ? { id: schoolData.id, name: schoolData.name } : null,
      }}
      packingItems={packingItems}
      qcItems={qcItems}
      qcRecord={qcRecord || null}
      qcHistory={qcHistory}
    />
  );
}
