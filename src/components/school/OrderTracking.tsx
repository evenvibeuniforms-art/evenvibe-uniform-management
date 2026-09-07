import { OrderDetails } from "@/app/(school)/school/orders/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";


const TIMELINE_STAGES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'production', label: 'Production' },
  { id: 'quality_check', label: 'Quality Check' },
  { id: 'packed', label: 'Packed' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' }
];

const STATUS_MESSAGES: Record<string, string> = {
  submitted: "Your requirement has been submitted and is waiting for review.",
  under_review: "EvenVibe is currently reviewing your requirement.",
  confirmed: "Your requirement has been confirmed and is ready for production.",
  production: "Your uniforms are currently being produced.",
  quality_check: "Your uniforms are undergoing final quality checks.",
  packed: "Your uniforms have been packed and are ready for dispatch.",
  dispatched: "Your order has been dispatched.",
  in_transit: "Your order is currently in transit.",
  delivered: "Your uniform order has been delivered."
};

export function OrderTracking({ order }: { order: OrderDetails }) {
  // Find current stage index
  const currentStageIndex = TIMELINE_STAGES.findIndex(stage => stage.id === order.status);

  // Helper to get history date for a status
  const getHistoryDate = (statusId: string) => {
    const historyItem = order.history.find(h => h.status === statusId);
    if (!historyItem) return null;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(historyItem.created_at));
  };

  const totalItems = order.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order Tracking</h1>
        <p className="text-slate-500 mt-2">
          Track your uniform order from submission to delivery.
        </p>
      </div>

      {/* Top Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Order Number</div>
            <div className="text-lg font-bold text-slate-900">{order.order_number}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Current Status</div>
            <div className="text-lg font-bold text-emerald-600 capitalize">{order.status.replace("_", " ")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Order Date</div>
            <div className="text-lg font-bold text-slate-900">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(order.created_at))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Estimated Delivery</div>
            <div className="text-lg font-bold text-slate-900">
              {order.estimated_delivery ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(order.estimated_delivery)) : "Not updated yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Left Column - Timeline */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-emerald-800">Current Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-900 capitalize mb-2">
                {order.status.replace("_", " ")}
              </div>
              <p className="text-emerald-700/80 text-sm">
                {STATUS_MESSAGES[order.status] || "Your order is being processed."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {TIMELINE_STAGES.map((stage, index) => {
                  const isCompleted = index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  const isUpcoming = index > currentStageIndex;
                  const historyDate = getHistoryDate(stage.id);

                  return (
                    <div key={stage.id} className="relative flex gap-4 items-start">
                      {/* Connector Line */}
                      {index !== TIMELINE_STAGES.length - 1 && (
                        <div className={`absolute left-[11px] top-6 bottom-[-24px] w-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      )}
                      
                      {/* Icon */}
                      <div className={`relative z-10 bg-white rounded-full ${isCompleted ? 'text-emerald-500' : isCurrent ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-6 h-6 fill-emerald-100" />
                        ) : isCurrent ? (
                          <div className="w-6 h-6 rounded-full border-4 border-emerald-500 bg-white" />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`flex flex-col ${isUpcoming ? 'opacity-50' : ''}`}>
                        <span className={`font-semibold ${isCurrent ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-500'}`}>
                          {stage.label}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5">
                          {isCompleted || isCurrent ? historyDate || "In Progress" : "Pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Details */}
        <div className="md:col-span-2 space-y-6">
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tracking Information</CardTitle>
            </CardHeader>
            <CardContent>
              {order.tracking_number ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 border p-4 rounded-lg bg-slate-50">
                    <Truck className="h-8 w-8 text-slate-400" />
                    <div>
                      <div className="text-sm text-slate-500">Tracking Number</div>
                      <div className="font-semibold text-slate-900">{order.tracking_number}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border p-4 rounded-lg bg-slate-50">
                    <Package className="h-8 w-8 text-slate-400" />
                    <div>
                      <div className="text-sm text-slate-500">Courier</div>
                      <div className="font-semibold text-slate-900">{order.courier_name || "N/A"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                  <Truck className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p>Tracking details will appear here once your order is dispatched.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Requirement Summary</CardTitle>
              <Link href={`/school/requirements/${order.requirement.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-100">View Requirement</Badge>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-sm text-slate-500">Requirement No</div>
                  <div className="font-medium">{order.requirement.requirement_number}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Total Items</div>
                  <div className="font-medium text-emerald-600">{totalItems}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Regular Uniforms</div>
                  <div className="font-medium">{order.requirement.regular_uniform_students}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">T-Shirt Uniforms</div>
                  <div className="font-medium">{order.requirement.tshirt_uniform_students}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Items</CardTitle>
              <CardDescription>Final quantities submitted for production</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Uniform Type</th>
                      <th className="px-4 py-3 font-medium">Item</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items
                      .sort((a, b) => {
                        if (a.uniform_type !== b.uniform_type) return a.uniform_type.localeCompare(b.uniform_type);
                        if (a.item_type !== b.item_type) return a.item_type.localeCompare(b.item_type);
                        return a.size.localeCompare(b.size, undefined, { numeric: true });
                      })
                      .map(item => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-3 capitalize">{item.uniform_type}</td>
                          <td className="px-4 py-3 capitalize">{item.item_type}</td>
                          <td className="px-4 py-3 font-medium">{item.size}</td>
                          <td className="px-4 py-3 text-right font-bold">{item.quantity}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
