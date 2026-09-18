import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AdminPackingDeliveryListView, { PackingDeliveryRow } from "./views/AdminPackingDeliveryListView";

export const metadata = {
  title: "Packing & Delivery Management | EvenVibe Admin",
};

interface RawOrderRow {
  id: string;
  order_number: string;
  status: string;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  school_id: string;
  schools: { id: string; name: string } | { id: string; name: string }[] | null;
  requirements:
    | {
        id: string;
        total_students: number | null;
        requirement_items: { quantity: number }[] | null;
      }
    | {
        id: string;
        total_students: number | null;
        requirement_items: { quantity: number }[] | null;
      }[]
    | null;
  packing_records:
    | {
        id: string;
        status: string;
        total_quantity: number;
        packed_quantity: number;
        remarks: string | null;
        started_at: string | null;
        completed_at: string | null;
        updated_at: string;
      }
    | {
        id: string;
        status: string;
        total_quantity: number;
        packed_quantity: number;
        remarks: string | null;
        started_at: string | null;
        completed_at: string | null;
        updated_at: string;
      }[]
    | null;
}

function calculateCutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function calculateStartOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function AdminPackingDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const params = await searchParams;

  const page = typeof params.page === "string" ? Math.max(1, parseInt(params.page) || 1) : 1;
  const pageSize = 10;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const date = typeof params.date === "string" ? params.date : "all";
  const sort = typeof params.sort === "string" ? params.sort : "updated";
  const orderAsc = typeof params.order === "string" && params.order === "asc";

  // Fetch orders that are in packed, dispatched, in_transit, delivered
  const { data: rawOrders, error } = await supabase
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
      created_at,
      updated_at,
      school_id,
      schools (
        id,
        name
      ),
      requirements (
        id,
        total_students,
        requirement_items (
          quantity
        )
      ),
      packing_records (
        id,
        status,
        total_quantity,
        packed_quantity,
        remarks,
        started_at,
        completed_at,
        updated_at
      )
    `)
    .in("status", [
      "packed",
      "dispatched",
      "in_transit",
      "delivered",
    ])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("AdminPackingDeliveryPage fetch error:", error);
  }

  const typedOrders = (rawOrders || []) as unknown as RawOrderRow[];
  const eligibleRows: PackingDeliveryRow[] = [];

  typedOrders.forEach((o) => {
    const school = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    const req = Array.isArray(o.requirements) ? o.requirements[0] : o.requirements;
    const packing = Array.isArray(o.packing_records)
      ? o.packing_records[0]
      : o.packing_records;

    // Determine category based on prompt Section 16:
    // Ready for Packing: orders.status = packed AND no packing record exists
    // Packing In Progress: packing_records.status = in_progress
    // Packed: packing_records.status = completed AND orders.status = packed
    // Dispatched: orders.status = dispatched
    // In Transit: orders.status = in_transit
    // Delivered: orders.status = delivered
    let deliveryCategory:
      | "ready_for_packing"
      | "packing_in_progress"
      | "packed"
      | "dispatched"
      | "in_transit"
      | "delivered" = "ready_for_packing";

    if (o.status === "dispatched") {
      deliveryCategory = "dispatched";
    } else if (o.status === "in_transit") {
      deliveryCategory = "in_transit";
    } else if (o.status === "delivered") {
      deliveryCategory = "delivered";
    } else if (o.status === "packed") {
      if (!packing || packing.status === "pending") {
        deliveryCategory = "ready_for_packing";
      } else if (packing.status === "in_progress") {
        deliveryCategory = "packing_in_progress";
      } else if (packing.status === "completed") {
        deliveryCategory = "packed";
      }
    }

    const items = req?.requirement_items || [];
    const totalItems = items.reduce((acc, item) => acc + (item.quantity || 0), 0);

    eligibleRows.push({
      id: o.id,
      orderNumber: o.order_number,
      schoolName: school?.name || "School",
      orderStatus: o.status,
      deliveryCategory,
      packingStatus: packing?.status || null,
      courierName: o.courier_name,
      trackingNumber: o.tracking_number,
      estimatedDelivery: o.estimated_delivery,
      shippedAt: o.shipped_at,
      deliveredAt: o.delivered_at,
      createdAt: o.created_at,
      updatedAt: packing?.updated_at || o.updated_at,
      totalStudents: req?.total_students || 0,
      totalItems,
      totalQuantity: packing?.total_quantity || totalItems,
      packedQuantity: packing?.packed_quantity || 0,
      hasPackingRecord: !!packing,
    });
  });

  // Calculate status counts
  const statusCounts = {
    all: eligibleRows.length,
    ready_for_packing: eligibleRows.filter((r) => r.deliveryCategory === "ready_for_packing").length,
    packing_in_progress: eligibleRows.filter((r) => r.deliveryCategory === "packing_in_progress").length,
    packed: eligibleRows.filter((r) => r.deliveryCategory === "packed").length,
    dispatched: eligibleRows.filter((r) => r.deliveryCategory === "dispatched").length,
    in_transit: eligibleRows.filter((r) => r.deliveryCategory === "in_transit").length,
    delivered: eligibleRows.filter((r) => r.deliveryCategory === "delivered").length,
  };

  // Apply filters
  let filtered = eligibleRows;

  // Search filter
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.orderNumber.toLowerCase().includes(q) || r.schoolName.toLowerCase().includes(q)
    );
  }

  // Status tab filter
  if (status && status !== "all") {
    filtered = filtered.filter((r) => r.deliveryCategory === status);
  }

  // Date filter
  if (date === "today") {
    const cutoff = calculateStartOfToday();
    filtered = filtered.filter((r) => r.createdAt >= cutoff);
  } else if (date === "7d") {
    const cutoff = calculateCutoffDate(7);
    filtered = filtered.filter((r) => r.createdAt >= cutoff);
  } else if (date === "30d") {
    const cutoff = calculateCutoffDate(30);
    filtered = filtered.filter((r) => r.createdAt >= cutoff);
  }

  // Sorting
  filtered.sort((a, b) => {
    if (sort === "created") {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return orderAsc ? diff : -diff;
    }
    if (sort === "order") {
      const comp = a.orderNumber.localeCompare(b.orderNumber);
      return orderAsc ? comp : -comp;
    }
    // default: updated_at
    const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return orderAsc ? diff : -diff;
  });

  const totalCount = filtered.length;
  const startIndex = (page - 1) * pageSize;
  const paginatedOrders = filtered.slice(startIndex, startIndex + pageSize);

  return (
    <AdminPackingDeliveryListView
      orders={paginatedOrders}
      totalCount={totalCount}
      currentPage={page}
      pageSize={pageSize}
      statusCounts={statusCounts}
      search={search}
      status={status}
      date={date}
      sort={sort}
      order={orderAsc ? "asc" : "desc"}
    />
  );
}
