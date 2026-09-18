"use client";

import { OrderDetails } from "../actions";
import { cancelOrder } from "../actions";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Truck, CheckCircle2, Circle, AlertCircle, Loader2, Eye, UserPlus, Info, Lock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddStudentsToOrderDialog } from "./AddStudentsToOrderDialog";

const statusColors: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-purple-100 text-purple-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  production: "bg-amber-100 text-amber-800",
  quality_check: "bg-orange-100 text-orange-800",
  packed: "bg-cyan-100 text-cyan-800",
  dispatched: "bg-teal-100 text-teal-800",
  in_transit: "bg-emerald-100 text-emerald-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Being Reviewed",
  confirmed: "Confirmed",
  production: "Production",
  quality_check: "Quality Checking",
  packed: "Packed",
  dispatched: "Dispatched",
  in_transit: "On the Way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ORDER_STAGES = [
  "submitted",
  "under_review",
  "confirmed",
  "production",
  "quality_check",
  "packed",
  "dispatched",
  "in_transit",
  "delivered"
];

import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { getOrderDetails, OrderHistoryItem, OrderStatus } from "../actions";

export function SchoolOrderDetailsView({ order: initialOrder }: { order: OrderDetails }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetails>(initialOrder);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);

  // Realtime updates for order status and metadata
  useRealtimeSubscription({
    table: "orders",
    filter: `id=eq.${initialOrder.id}`,
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        const newStatus = (updated.status as OrderStatus) || initialOrder.status;
        setOrder((prev) => ({
          ...prev,
          status: newStatus,
          courier_name: (updated.courier_name as string | null) ?? prev.courier_name,
          tracking_number: (updated.tracking_number as string | null) ?? prev.tracking_number,
          estimated_delivery: (updated.estimated_delivery as string | null) ?? prev.estimated_delivery,
        }));
        toast.info(`Order status updated: ${statusLabels[newStatus] || newStatus}`);
        
        // Silently sync complete order details
        getOrderDetails(initialOrder.id).then((res) => {
          if (res.order) setOrder(res.order);
        });
      }
    },
  });

  // Realtime updates for order status history timeline
  useRealtimeSubscription({
    table: "order_status_history",
    filter: `order_id=eq.${initialOrder.id}`,
    event: "INSERT",
    onEvent: (payload) => {
      if (payload.new) {
        const newHist = payload.new as unknown as OrderHistoryItem;
        setOrder((prev) => ({
          ...prev,
          history: [newHist, ...prev.history.filter((h) => h.id !== newHist.id)],
        }));
      }
    },
  });

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const res = await cancelOrder(order.id, "Cancelled by School Admin");
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order cancelled successfully");
        setCancelOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to cancel order");
    } finally {
      setIsCancelling(false);
    }
  };

  const isCancelled = order.status === "cancelled";
  const currentStageIndex = ORDER_STAGES.indexOf(order.status);
  
  // Can only cancel if it's in early stages and not already cancelled
  const canCancel = !isCancelled && (order.status === "submitted" || order.status === "under_review");

  // Group items
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // Group by Class -> Section -> Gender -> Item
  const groupedItems = order.items.reduce((acc, item) => {
    const cName = item.class_name || 'Legacy';
    const sName = item.section_name || 'Legacy';
    const gName = item.gender || 'Legacy';
    const iName = item.item_name || 'Legacy';

    if (!acc[cName]) acc[cName] = {};
    if (!acc[cName][sName]) acc[cName][sName] = {};
    if (!acc[cName][sName][gName]) acc[cName][sName][gName] = {};
    if (!acc[cName][sName][gName][iName]) acc[cName][sName][gName][iName] = [];
    
    acc[cName][sName][gName][iName].push(item);
    return acc;
  }, {} as Record<string, Record<string, Record<string, Record<string, typeof order.items>>>>);

  return (
    <div className="space-y-6 pb-12">
      {/* SECTION 1: HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/school/orders" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Order Status</h1>
            <Badge className={`${statusColors[order.status] || "bg-slate-100 text-slate-800"} border-0 px-2 py-1 text-sm`}>
              {statusLabels[order.status] || order.status}
            </Badge>
          </div>
          <p className="text-slate-600 font-medium text-lg mt-1">{order.order_number}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Link href={`/school/requirements/${order.requirement.id}`}>
            <Button variant="outline" className="bg-white">
              <Eye className="h-4 w-4 mr-2" />
              View Requirement
            </Button>
          </Link>
          
          {canCancel && (
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setCancelOpen(true)}>
                Cancel Order
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel Order?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to cancel this order? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isCancelling}>
                    Keep Order
                  </Button>
                  <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
                    {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isCancelling ? "Cancelling..." : "Cancel Order"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-500 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div><span className="font-medium text-slate-700">Order Date:</span> {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        <div>
          <span className="font-medium text-slate-700">Last Updated:</span> 
          {order.history.length > 0 ? new Date(order.history[0].created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true }) : new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SECTION 2: STUDENT SIZES */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3">
            <CardTitle className="text-slate-900 text-lg">Student Sizes</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Total Students</span>
              <span className="font-medium text-slate-900">{order.requirement.total_students}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Completed Sizes</span>
              <span className="font-medium text-emerald-600">{order.tracked_students_count || order.requirement.total_students}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">Pending Sizes</span>
              <span className="font-medium text-amber-600">{order.pending_students_count || 0}</span>
            </div>

            {/* ACTION AREA: Add Students to Existing Order */}
            <div className="pt-2">
              {order.status === 'submitted' || order.status === 'under_review' ? (
                order.eligible_students && order.eligible_students.length > 0 ? (
                  <Button
                    onClick={() => setAddStudentsOpen(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center justify-center gap-2 shadow-sm"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>+ Add Students to Existing Order</span>
                    <Badge variant="secondary" className="bg-emerald-700 text-white ml-1.5 px-2 py-0.5 text-xs">
                      {order.eligible_students.length} ready
                    </Badge>
                  </Button>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-500 text-xs flex items-center gap-2">
                    <Info className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>No students with completed sizes are ready to add to this order.</span>
                  </div>
                )
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-400 text-xs flex items-center gap-2">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Students can no longer be added at this stage.</span>
                </div>
              )}
            </div>

            {order.is_legacy && (
              <div className="mt-4 p-3 bg-slate-50 rounded-md flex gap-2 text-slate-500 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-slate-400" />
                <p>Additional student details are not available for this previous order.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 3: ORDER SUMMARY */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3">
            <CardTitle className="text-slate-900 text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Total Students</span>
              <span className="font-medium text-slate-900">{order.requirement.total_students}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Total Items</span>
              <span className="font-medium text-slate-900">{totalItems}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600">Regular Uniforms</span>
              <span className="font-medium text-slate-900">{order.requirement.regular_uniform_students}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">T-Shirt Uniforms</span>
              <span className="font-medium text-slate-900">{order.requirement.tshirt_uniform_students}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 4: QUANTITY DETAILS */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b pb-3">
          <CardTitle className="text-slate-900 text-lg">Quantity Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {totalItems === 0 ? (
            <p className="text-slate-500 italic">No item quantities recorded for this order.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedItems).sort(([a],[b]) => a.localeCompare(b)).map(([cName, sections]) => (
                <div key={cName} className="border rounded-lg overflow-hidden border-slate-200 bg-white">
                  <div className="bg-slate-100 px-4 py-2 font-medium text-slate-800 capitalize border-b border-slate-200">
                    {cName}
                  </div>
                  <div className="p-4 space-y-6">
                    {Object.entries(sections).sort(([a],[b]) => a.localeCompare(b)).map(([sName, genders]) => (
                      <div key={sName} className="space-y-4">
                        <div className="font-medium text-slate-700 bg-slate-50 px-3 py-1.5 rounded-md inline-block border border-slate-100 shadow-sm text-sm">
                          Section {sName}
                        </div>
                        <div className="space-y-5 pl-4 border-l-2 border-slate-100 ml-2">
                          {Object.entries(genders).sort(([a],[b]) => a.localeCompare(b)).map(([gName, itemsByName]) => (
                            <div key={gName} className="space-y-3">
                              <div className="font-medium text-slate-600 capitalize text-sm">{gName}</div>
                              <div className="pl-4 space-y-4">
                                {Object.entries(itemsByName).sort(([a],[b]) => a.localeCompare(b)).map(([iName, items]) => (
                                  <div key={iName}>
                                    <div className="text-sm font-medium text-slate-500 mb-2">{iName}</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                      {items.sort((a,b) => a.size.localeCompare(b.size)).map((item) => (
                                        <div key={item.id} className="flex justify-between items-center bg-white px-3 py-1.5 rounded-md text-sm border border-slate-200 shadow-sm">
                                          <span className="text-slate-600">Size {item.size}</span>
                                          <span className="font-bold text-slate-900">{item.quantity}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="text-xs text-slate-400 mt-4 flex gap-2 items-start">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Note: Detailed class/section/gender grouping may be unavailable for historical orders. Only available dimensions are shown.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 5: ORDER PROGRESS */}
        <Card className="border-slate-200 lg:col-span-2 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3">
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-500" /> Order Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {isCancelled ? (
              <div className="flex items-center gap-3 p-4 bg-red-50 text-red-800 rounded-lg border border-red-100">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">This order has been cancelled.</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                
                <div className="space-y-6">
                  {ORDER_STAGES.map((stage, idx) => {
                    const isCompleted = currentStageIndex >= idx;
                    const isCurrent = currentStageIndex === idx;
                    
                    return (
                      <div key={stage} className={`relative pl-8 ${isCompleted ? 'opacity-100' : 'opacity-40'}`}>
                        {/* Icon */}
                        <div className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center bg-white ${isCurrent ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 fill-slate-50" />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div>
                          <p className={`font-medium ${isCurrent ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {statusLabels[stage]}
                          </p>
                          {/* If we have a history entry for this stage, show the date */}
                          {order.history.find(h => h.status === stage) && (
                            <p className="text-xs text-slate-500 mt-1">
                              {new Date(order.history.find(h => h.status === stage)!.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 6: DELIVERY DETAILS */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3">
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-indigo-500" /> Delivery Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            <div>
              <p className="text-sm text-slate-500 mb-1">Courier</p>
              <p className="font-medium text-slate-900">{order.courier_name || "Not available yet"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Tracking Number</p>
              <p className="font-medium text-slate-900">{order.tracking_number || "Not available yet"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Estimated Delivery</p>
              <p className="font-medium text-slate-900">
                {order.estimated_delivery ? new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not available yet"}
              </p>
            </div>
            
            <div className="pt-4 border-t border-slate-100">
              <div className="mb-3">
                <p className="text-sm text-slate-500 mb-1">Shipped Date</p>
                <p className="font-medium text-slate-900">
                  {order.history.find(h => h.status === "dispatched")?.created_at 
                    ? new Date(order.history.find(h => h.status === "dispatched")!.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) 
                    : "Not available yet"}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Delivered Date</p>
                <p className="font-medium text-slate-900">
                  {order.history.find(h => h.status === "delivered")?.created_at 
                    ? new Date(order.history.find(h => h.status === "delivered")!.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) 
                    : "Not available yet"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Students Dialog */}
      <AddStudentsToOrderDialog
        isOpen={addStudentsOpen}
        onOpenChange={setAddStudentsOpen}
        orderId={order.id}
        eligibleStudents={order.eligible_students || []}
      />
    </div>
  );
}
