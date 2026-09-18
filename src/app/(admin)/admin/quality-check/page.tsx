import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AdminQualityCheckListView, { QualityCheckRow } from "./views/AdminQualityCheckListView";

export const metadata = {
  title: "Quality Check Management | EvenVibe Admin",
};

interface RawOrderRow {
  id: string;
  order_number: string;
  status: string;
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
  production_records:
    | {
        id: string;
        stage: string;
        total_quantity: number;
        completed_quantity: number;
        completed_at: string | null;
        updated_at: string;
      }
    | {
        id: string;
        stage: string;
        total_quantity: number;
        completed_quantity: number;
        completed_at: string | null;
        updated_at: string;
      }[]
    | null;
  quality_check_records:
    | {
        id: string;
        status: string;
        total_quantity: number;
        checked_quantity: number;
        passed_quantity: number;
        defective_quantity: number;
        updated_at: string;
      }
    | {
        id: string;
        status: string;
        total_quantity: number;
        checked_quantity: number;
        passed_quantity: number;
        defective_quantity: number;
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

export default async function AdminQualityCheckPage({
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

  // Fetch orders that are in production or quality_check or beyond
  const { data: rawOrders, error } = await supabase
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
      ),
      requirements (
        id,
        total_students,
        requirement_items (
          quantity
        )
      ),
      production_records (
        id,
        stage,
        total_quantity,
        completed_quantity,
        completed_at,
        updated_at
      ),
      quality_check_records (
        id,
        status,
        total_quantity,
        checked_quantity,
        passed_quantity,
        defective_quantity,
        updated_at
      )
    `)
    .in("status", [
      "production",
      "quality_check",
      "packed",
      "dispatched",
      "in_transit",
      "delivered",
    ])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("AdminQualityCheckPage fetch error:", error);
  }

  const typedOrders = (rawOrders || []) as unknown as RawOrderRow[];

  // Filter for orders that legitimately belong in the Quality Check module
  // 1. orders.status = 'production' AND production_records.stage = 'production_completed'
  // 2. orders with a quality_check_records entry or orders.status = 'quality_check'
  const eligibleRows: QualityCheckRow[] = [];

  typedOrders.forEach((o) => {
    const school = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    const req = Array.isArray(o.requirements) ? o.requirements[0] : o.requirements;
    const prod = Array.isArray(o.production_records)
      ? o.production_records[0]
      : o.production_records;
    const qc = Array.isArray(o.quality_check_records)
      ? o.quality_check_records[0]
      : o.quality_check_records;

    let qcStatus = "";
    if (qc) {
      qcStatus = qc.status; // 'in_progress', 'passed', 'failed', 'pending'
    } else if (o.status === "production" && prod?.stage === "production_completed") {
      qcStatus = "ready_for_qc";
    } else if (o.status === "quality_check") {
      qcStatus = "in_progress";
    } else {
      // Order is still in early production (started, cutting, etc.) or no QC relation
      return;
    }

    const items = req?.requirement_items || [];
    const totalItems = items.reduce((acc, item) => acc + (item.quantity || 0), 0);

    eligibleRows.push({
      id: o.id,
      orderNumber: o.order_number,
      schoolName: school?.name || "School",
      orderStatus: o.status,
      qcStatus,
      createdAt: o.created_at,
      updatedAt: qc?.updated_at || o.updated_at,
      totalStudents: req?.total_students || 0,
      totalItems,
      checkedQuantity: qc?.checked_quantity || 0,
      passedQuantity: qc?.passed_quantity || 0,
      defectiveQuantity: qc?.defective_quantity || 0,
      hasQcRecord: !!qc,
    });
  });

  // Calculate status counts across all eligible orders
  const statusCounts = {
    all: eligibleRows.length,
    ready_for_qc: eligibleRows.filter((r) => r.qcStatus === "ready_for_qc").length,
    in_progress: eligibleRows.filter((r) => r.qcStatus === "in_progress").length,
    passed: eligibleRows.filter((r) => r.qcStatus === "passed").length,
    failed: eligibleRows.filter((r) => r.qcStatus === "failed").length,
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
    filtered = filtered.filter((r) => r.qcStatus === status);
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
    <AdminQualityCheckListView
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
