import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AdminPackingDeliveryDetailsView, {
  DeliveryItemRow,
} from "../views/AdminPackingDeliveryDetailsView";
import { DeliveryProofImage } from "@/types/database";

export const metadata = {
  title: "Delivery | EvenVibe Admin",
};

export default async function AdminPackingDeliveryDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch Order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      courier_name,
      tracking_number,
      estimated_delivery,
      shipped_at,
      delivered_at,
      delivery_remarks,
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

  // 2. Concurrently fetch QC Record, QC Items, Delivery/Packing Record, and History
  const [
    { data: qcRecord },
    { data: qcItems },
    { data: packingRecord },
    { data: packingHistoryRaw },
    { data: orderStatusHistory },
    { data: proofImagesRaw },
  ] = await Promise.all([
    supabase
      .from("quality_check_records")
      .select("id, status, total_quantity, checked_quantity, passed_quantity, defective_quantity, completed_at, remarks")
      .eq("order_id", id)
      .maybeSingle(),
    supabase
      .from("order_quality_check_items")
      .select("id, item_name, style_id, style_name, color, size, packed_quantity, passed_quantity, defective_quantity, status")
      .eq("order_id", id)
      .order("item_name")
      .order("size"),
    supabase
      .from("packing_records")
      .select("*")
      .eq("order_id", id)
      .maybeSingle(),
    supabase
      .from("packing_history")
      .select(`
        id,
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
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("delivery_proof_images")
      .select(`
        id,
        order_id,
        storage_path,
        file_name,
        mime_type,
        file_size,
        caption,
        uploaded_by,
        created_at,
        display_order,
        profiles:uploaded_by (
          id,
          full_name,
          role
        )
      `)
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  // Section 6, 8, 9: Delivery Quantity Source & Zero Quantity Rule
  // Deliverable quantities come strictly from QC Passed Quantity
  // Rows with passed_quantity = 0 or null are strictly excluded from operational delivery rows
  const isDelivered = order.status === "delivered";
  const isDispatched = order.status === "dispatched" || order.status === "in_transit";
  const isDeliveryInProgress =
    packingRecord?.status === "in_progress" || packingRecord?.status === "completed";

  const rowStatus: "ready" | "in_progress" | "dispatched" | "delivered" = isDelivered
    ? "delivered"
    : isDispatched
    ? "dispatched"
    : isDeliveryInProgress
    ? "in_progress"
    : "ready";

  const deliveryItems: DeliveryItemRow[] = (qcItems || [])
    .filter((item) => (item.passed_quantity || 0) > 0)
    .map((item) => ({
      id: item.id,
      styleName: item.style_name?.trim() || "Standard",
      itemName: item.item_name,
      color: item.color?.trim() || "Default",
      size: item.size,
      quantity: item.passed_quantity || 0,
      status: rowStatus,
    }));

  interface RawHistoryItem {
    id: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
    changed_by: string;
    profiles:
      | { id: string; full_name: string | null; role: string }
      | { id: string; full_name: string | null; role: string }[]
      | null;
  }

  const rawHistory = (packingHistoryRaw || []) as unknown as RawHistoryItem[];
  const formattedHistory = rawHistory.map((item) => ({
    ...item,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
  }));

  const formattedOrder = {
    ...order,
    schools: Array.isArray(order.schools) ? order.schools[0] : order.schools,
  };

  // Generate temporary signed URLs for delivery proof images
  let proofImages: DeliveryProofImage[] = [];
  if (proofImagesRaw && proofImagesRaw.length > 0) {
    const paths = proofImagesRaw.map((p) => p.storage_path);
    const { data: signedUrls } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrls(paths, 3600);
    const signedMap = new Map((signedUrls || []).map((s) => [s.path, s.signedUrl]));
    proofImages = proofImagesRaw.map((img) => ({
      ...img,
      profiles: Array.isArray(img.profiles) ? img.profiles[0] : img.profiles,
      signed_url: signedMap.get(img.storage_path) || null,
    }));
  }

  return (
    <AdminPackingDeliveryDetailsView
      order={formattedOrder}
      qcRecord={qcRecord || null}
      deliveryItems={deliveryItems}
      packingRecord={packingRecord || null}
      packingHistory={formattedHistory}
      orderStatusHistory={orderStatusHistory || []}
      proofImages={proofImages}
    />
  );
}

