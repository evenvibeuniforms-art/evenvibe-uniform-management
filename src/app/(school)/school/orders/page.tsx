import { getOrdersList } from "./actions";
import { SchoolOrdersListView } from "./SchoolOrdersListView";
import { AlertCircle } from "lucide-react";

export const metadata = {
  title: "Orders | EvenVibe School Admin",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const dateSort = params.dateSort === "asc" ? "asc" : "desc";

  const { orders, pagination, error } = await getOrdersList({
    page,
    limit: 10,
    search,
    status,
    dateSort,
  });

  if (error || !orders || !pagination) {
    return (
      <div className="p-12 text-center text-red-500 max-w-lg mx-auto bg-red-50 rounded-xl mt-8">
        <AlertCircle className="mx-auto h-12 w-12 mb-4" />
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error || "Failed to load orders"}</p>
      </div>
    );
  }

  return <SchoolOrdersListView orders={orders} pagination={pagination} />;
}
