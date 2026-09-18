import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import AdminOrdersListView from "./views/AdminOrdersListView";

export const metadata = {
  title: "Orders | EvenVibe Admin",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const params = await searchParams;

  const page = typeof params.page === "string" ? parseInt(params.page) : 1;
  const pageSize = 10;
  const search = typeof params.search === "string" ? params.search : "";
  const schoolId = typeof params.schoolId === "string" ? params.schoolId : "";
  const status = typeof params.status === "string" ? params.status : "";

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      updated_at,
      schools (
        id,
        name
      ),
      requirements (
        requirement_items (
          quantity
        )
      )
    `, { count: "exact" });

  if (search) {
    query = query.ilike("order_number", `%${search}%`);
  }
  if (schoolId && schoolId !== "all") {
    query = query.eq("school_id", schoolId);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  // Sorting
  const sort = typeof params.sort === "string" ? params.sort : "created_at";
  const order = typeof params.order === "string" && params.order === "asc" ? true : false;
  
  if (sort === "order_number") {
    query = query.order("order_number", { ascending: order });
  } else if (sort === "updated_at") {
    query = query.order("updated_at", { ascending: order });
  } else if (sort === "status") {
    query = query.order("status", { ascending: order });
  } else {
    query = query.order("created_at", { ascending: order }); // Default
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.range(from, to);

  const { data: ordersData, count, error } = await query;
  
  if (error) {
    console.error("[AdminOrdersPage] Error fetching orders:", error);
  }

  const { data: schoolsData } = await supabase.from("schools").select("id, name").order("name");

  interface AdminOrderRequirementItem {
    quantity: number;
  }

  interface AdminOrderDbRow {
    id: string;
    order_number: string;
    status: string;
    created_at: string;
    updated_at: string;
    schools: { id: string; name: string } | { id: string; name: string }[] | null;
    requirements: {
      requirement_items: AdminOrderRequirementItem[];
    } | null;
  }

  // Format total quantity
  const formattedOrders = ((ordersData || []) as unknown as AdminOrderDbRow[]).map((o) => {
    const schoolObj = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    const totalQty = o.requirements?.requirement_items?.reduce((acc: number, item: AdminOrderRequirementItem) => acc + (item.quantity || 0), 0) || 0;
    return {
      id: o.id,
      orderNumber: o.order_number,
      schoolName: schoolObj?.name || "Unknown",
      status: o.status,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      totalQuantity: totalQty,
    };
  });

  return (
    <AdminOrdersListView 
      orders={formattedOrders} 
      totalCount={count || 0}
      schools={schoolsData || []}
      currentPage={page}
      pageSize={pageSize}
      search={search}
      schoolId={schoolId}
      status={status}
      sort={sort}
      order={order ? "asc" : "desc"}
    />
  );
}
