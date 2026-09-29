import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AdminProductionListView from "./views/AdminProductionListView";
import { resolveOrderCurrentStage, OrderWorkflowStage } from "@/lib/productionWorkflow";

export const metadata = {
  title: "Production Management | EvenVibe Admin",
};

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  school_id: string;
  schools: { id: string; name: string } | null;
  requirements: {
    id: string;
    total_students: number | null;
    requirement_items: { quantity: number }[] | null;
  } | null;
  production_records:
    | {
        id: string;
        stage: string;
        total_quantity: number;
        completed_quantity: number;
        started_at: string;
        completed_at: string | null;
        remarks: string | null;
        updated_at: string;
      }
    | {
        id: string;
        stage: string;
        total_quantity: number;
        completed_quantity: number;
        started_at: string;
        completed_at: string | null;
        remarks: string | null;
        updated_at: string;
      }[]
    | null;
  order_production_workflows: OrderWorkflowStage[] | null;
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

export default async function AdminProductionPage({
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
  const sort = typeof params.sort === "string" ? params.sort : "updated_at";
  const orderAsc = typeof params.order === "string" && params.order === "asc";

  let query = supabase
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
        started_at,
        completed_at,
        remarks,
        updated_at
      ),
      order_production_workflows (
        id,
        order_id,
        stage_key,
        sequence_order,
        status,
        started_at,
        completed_at
      )
    `, { count: "exact" })
    .in("status", ["confirmed", "production"]);

  // Server-side search by Order Number OR School Name
  if (search) {
    const { data: matchedSchools } = await supabase
      .from("schools")
      .select("id")
      .ilike("name", `%${search}%`);

    const schoolIds = matchedSchools?.map((s) => s.id) || [];

    if (schoolIds.length > 0) {
      query = query.or(`order_number.ilike.%${search}%,school_id.in.(${schoolIds.join(",")})`);
    } else {
      query = query.ilike("order_number", `%${search}%`);
    }
  }

  // Server-side status filtering based on custom workflow stage
  if (status === "ready_to_start") {
    query = query.eq("status", "confirmed");
  } else if (status === "production_completed") {
    const { data: matchingRecs } = await supabase
      .from("production_records")
      .select("order_id")
      .eq("stage", "production_completed");

    const matchingOrderIds = matchingRecs?.map((r) => r.order_id) || [];
    if (matchingOrderIds.length > 0) {
      query = query.in("id", matchingOrderIds);
    } else {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  } else if (
    [
      "stock_sizes",
      "inventory",
      "cutting",
      "stitching",
      "printing",
      "embroidering",
      "ironing_packing",
      "checking",
      "production_started",
      "finishing",
    ].includes(status)
  ) {
    // Find orders where this stage is currently in_progress in order_production_workflows
    const [wfRes, recRes] = await Promise.all([
      supabase
        .from("order_production_workflows")
        .select("order_id")
        .eq("stage_key", status)
        .eq("status", "in_progress"),
      supabase
        .from("production_records")
        .select("order_id")
        .eq("stage", status),
    ]);

    const wfOrderIds = wfRes.data?.map((w) => w.order_id) || [];
    const recOrderIds = recRes.data?.map((r) => r.order_id) || [];
    const combinedIds = Array.from(new Set([...wfOrderIds, ...recOrderIds]));

    if (combinedIds.length > 0) {
      query = query.in("id", combinedIds);
    } else {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // No matches
    }
  }

  // Server-side date filtering
  if (date === "today") {
    query = query.gte("created_at", calculateStartOfToday());
  } else if (date === "7days") {
    query = query.gte("created_at", calculateCutoffDate(7));
  } else if (date === "30days") {
    query = query.gte("created_at", calculateCutoffDate(30));
  }

  // Server-side sorting
  if (sort === "order_number") {
    query = query.order("order_number", { ascending: orderAsc });
  } else if (sort === "created_at") {
    query = query.order("created_at", { ascending: orderAsc });
  } else if (sort === "status") {
    query = query.order("status", { ascending: orderAsc });
  } else {
    query = query.order("updated_at", { ascending: orderAsc }); // Default: recently updated first
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: ordersData, count, error } = await query;

  if (error) {
    console.error("Error loading production orders:", error);
  }

  const typedOrders = (ordersData || []) as unknown as OrderRow[];

  // Format list items resolving current stage from EACH order's own workflow
  const formattedOrders = typedOrders.map((o) => {
    const req = o.requirements;
    const totalStudents = req?.total_students || 0;
    const totalItems =
      req?.requirement_items?.reduce((acc: number, item) => acc + (item.quantity || 0), 0) || 0;

    const prodRecord = Array.isArray(o.production_records)
      ? o.production_records[0]
      : o.production_records;

    const resolved = resolveOrderCurrentStage(
      o.order_production_workflows,
      o.status,
      prodRecord?.stage
    );

    const stage = resolved.currentStageKey;
    const totalQty = prodRecord ? prodRecord.total_quantity : totalItems;
    const completedQty = prodRecord ? prodRecord.completed_quantity : 0;
    const progressPercent = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;

    return {
      id: o.id,
      orderNumber: o.order_number,
      schoolName: o.schools?.name || "Unknown School",
      orderStatus: o.status,
      stage,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      totalStudents,
      totalItems: totalQty,
      completedQuantity: completedQty,
      progressPercent,
      hasProductionRecord: !!prodRecord,
    };
  });


  return (
    <AdminProductionListView
      orders={formattedOrders}
      totalCount={count || 0}
      currentPage={page}
      pageSize={pageSize}
      search={search}
      status={status}
      date={date}
      sort={sort}
      order={orderAsc ? "asc" : "desc"}
    />
  );
}
