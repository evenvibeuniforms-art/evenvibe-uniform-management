import { getOrderDetails } from "../actions";
import { OrderTracking } from "@/components/school/OrderTracking";
import { AlertCircle, PackageSearch } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Order Details | EvenVibe School Admin",
};

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { order, error } = await getOrderDetails(id);

  if (error) {
    return (
      <div className="p-12 text-center text-red-500 max-w-lg mx-auto bg-red-50 rounded-xl mt-8">
        <AlertCircle className="mx-auto h-12 w-12 mb-4" />
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center max-w-2xl mx-auto mt-8">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-6">
          <PackageSearch className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Order Not Found</h2>
        <p className="text-slate-500 mb-6 max-w-md">
          The requested order could not be found or you do not have permission to view it.
        </p>
        <div className="flex gap-4">
          <Link href="/school/orders">
            <Button className="bg-emerald-600 hover:bg-emerald-700">Go to My Orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <OrderTracking order={order} />;
}
