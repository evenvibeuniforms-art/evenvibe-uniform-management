"use client";

import { OrderDetails, cancelOrder, getOrderDetails, OrderHistoryItem, OrderStatus } from "../actions";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Truck, CheckCircle2, Circle, AlertCircle, Loader2, Eye, UserPlus, Info, Lock, Camera, Calendar } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddStudentsToOrderDialog } from "./AddStudentsToOrderDialog";
import { DeliveryProofLightbox } from "@/components/delivery/DeliveryProofLightbox";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";

const statusColors: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-evenvibe-light text-evenvibe-deep",
  confirmed: "bg-evenvibe-light text-evenvibe-deep",
  production: "bg-amber-100 text-amber-800",
  quality_check: "bg-orange-100 text-orange-800",
  packed: "bg-cyan-100 text-cyan-800",
  dispatched: "bg-evenvibe-light text-evenvibe-deep",
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

function formatDeliveryDate(dateStr?: string | null): string {
  if (!dateStr) return "Not available yet";
  const trimmed = dateStr.trim();
  if (!trimmed) return "Not available yet";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Handle plain date string YYYY-MM-DD or DD-MM-YYYY
  if (!trimmed.includes("T") && trimmed.includes("-")) {
    const parts = trimmed.split("-");
    if (parts.length === 3) {
      let year = 0, month = 0, day = 0;
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
      if (month >= 0 && month < 12 && day > 0 && year > 0) {
        return `${day} ${months[month]} ${year}`;
      }
    }
  }

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "Not available yet";
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDeliveryDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Not available yet";
  const trimmed = dateStr.trim();
  if (!trimmed) return "Not available yet";

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "Not available yet";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = hours.toString().padStart(2, "0");

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

export function SchoolOrderDetailsView({ order: initialOrder }: { order: OrderDetails }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetails>(initialOrder);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
          shipped_at: (updated.shipped_at as string | null) ?? prev.shipped_at,
          delivered_at: (updated.delivered_at as string | null) ?? prev.delivered_at,
          delivery_remarks: (updated.delivery_remarks as string | null) ?? prev.delivery_remarks,
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

  // Realtime updates for delivery proof images
  useRealtimeSubscription({
    table: "delivery_proof_images",
    filter: `order_id=eq.${initialOrder.id}`,
    onEvent: () => {
      getOrderDetails(initialOrder.id).then((res) => {
        if (res.order) setOrder(res.order);
      });
    },
  });

  // Realtime updates for packing records (delivery remarks and workflow)
  useRealtimeSubscription({
    table: "packing_records",
    filter: `order_id=eq.${initialOrder.id}`,
    onEvent: () => {
      getOrderDetails(initialOrder.id).then((res) => {
        if (res.order) setOrder(res.order);
      });
    },
  });

  // Realtime updates for quality check items (authoritative deliverable items)
  useRealtimeSubscription({
    table: "order_quality_check_items",
    filter: `order_id=eq.${initialOrder.id}`,
    onEvent: () => {
      getOrderDetails(initialOrder.id).then((res) => {
        if (res.order) setOrder(res.order);
      });
    },
  });

  // Realtime updates for order delivery batches
  useRealtimeSubscription({
    table: "order_delivery_batches",
    filter: `order_id=eq.${initialOrder.id}`,
    onEvent: () => {
      getOrderDetails(initialOrder.id).then((res) => {
        if (res.order) setOrder(res.order);
      });
    },
  });

  // Realtime updates for batch actual items
  useRealtimeSubscription({
    table: "order_delivery_actual_items",
    filter: `order_id=eq.${initialOrder.id}`,
    onEvent: () => {
      getOrderDetails(initialOrder.id).then((res) => {
        if (res.order) setOrder(res.order);
      });
    },
  });

  const [selectedBatchNumber, setSelectedBatchNumber] = useState<number | null>(null);

  const activeBatchNumber = useMemo(() => {
    if (!order.delivery_batches || order.delivery_batches.length === 0) return null;
    if (
      selectedBatchNumber !== null &&
      order.delivery_batches.some((b) => b.batch_number === selectedBatchNumber)
    ) {
      return selectedBatchNumber;
    }
    return order.delivery_batches[0].batch_number;
  }, [order.delivery_batches, selectedBatchNumber]);

  const selectedBatch = useMemo(() => {
    if (!order.delivery_batches || order.delivery_batches.length === 0) return null;
    return (
      order.delivery_batches.find((b) => b.batch_number === activeBatchNumber) ||
      order.delivery_batches[0]
    );
  }, [order.delivery_batches, activeBatchNumber]);

  const batchDeliveredItems = useMemo(() => {
    if (!selectedBatch || !selectedBatch.items) return [];
    return selectedBatch.items.filter((item) => (item.actual_quantity || 0) > 0);
  }, [selectedBatch]);

  const batchTotalDeliveredQuantity = useMemo(() => {
    return batchDeliveredItems.reduce((sum, item) => sum + (item.actual_quantity || 0), 0);
  }, [batchDeliveredItems]);

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

  const shippedDate = order.shipped_at || order.history.find(h => h.status === "dispatched")?.created_at;
  const deliveredDate = order.delivered_at || order.history.find(h => h.status === "delivered")?.created_at;
  
  // Orders in the delivery lifecycle (or with authoritative delivery data prepared)
  const isDeliveryStage =
    ["packed", "dispatched", "in_transit", "delivered"].includes(order.status) ||
    Boolean(order.has_delivery_data);

  // ----------------------------------------------------
  // SUB-RENDERERS FOR CLEAN CODE MODULARITY
  // ----------------------------------------------------

  // 1. ORDER PROGRESS / STATUS TIMELINE
  const renderOrderProgressCard = () => (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50 border-b pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-evenvibe-primary" /> Order Progress
          </CardTitle>
          <Badge className={`${statusColors[order.status] || "bg-slate-100 text-slate-800"} border-0 px-2.5 py-0.5 text-xs font-semibold`}>
            Current: {statusLabels[order.status] || order.status}
          </Badge>
        </div>
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
                const isFuture = currentStageIndex < idx;
                
                return (
                  <div key={stage} className={`relative pl-8 ${isFuture ? 'opacity-40' : 'opacity-100'}`}>
                    {/* Icon */}
                    <div className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center bg-white ${isCurrent ? 'ring-2 ring-evenvibe-primary ring-offset-2' : ''}`}>
                      {isCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-status-success" />
                      ) : (
                        <Circle className="w-6 h-6 text-slate-300 fill-slate-50" />
                      )}
                    </div>
                    
                    {/* Content */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${isCurrent ? 'font-bold text-evenvibe-deep' : isCompleted ? 'font-semibold text-slate-900' : 'font-normal text-slate-400'}`}>
                          {statusLabels[stage]}
                        </p>
                        {isCurrent && (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0 border-0 font-medium">
                            Current
                          </Badge>
                        )}
                      </div>
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
  );

  // 2. FINAL DELIVERY (PRIMARY SECTION FOR DELIVERY STAGE)
  const renderFinalDeliveryCard = () => (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50 border-b pb-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-evenvibe-primary" /> FINAL DELIVERY
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Final quantities prepared by EvenVibe for delivery.
            </p>
          </div>
          {order.has_delivery_data && (
            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs font-semibold px-2.5 py-1">
              Authoritative Delivery Data
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {order.has_delivery_data ? (
          <div className="space-y-6">
            {/* Delivery Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Delivery Quantity */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-evenvibe-deep flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Total Delivery Quantity</p>
                  <p className="text-2xl font-bold text-slate-900 leading-tight">
                    {order.total_delivery_quantity ?? 0}
                    <span className="text-xs font-normal text-slate-500 ml-1">units</span>
                  </p>
                </div>
              </div>

              {/* 2. Total Delivery Items */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Total Delivery Items</p>
                  <p className="text-2xl font-bold text-slate-900 leading-tight">
                    {order.total_delivery_items ?? 0}
                    <span className="text-xs font-normal text-slate-500 ml-1">items</span>
                  </p>
                </div>
              </div>

              {/* 3. Delivery Status */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-evenvibe-light text-evenvibe-deep flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Delivery Status</p>
                  <div className="mt-0.5">
                    <Badge className={`${statusColors[order.status] || "bg-slate-100 text-slate-800"} border-0 px-2.5 py-0.5 text-xs font-semibold`}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 4. Estimated Delivery */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Estimated Delivery</p>
                  <p className="text-sm font-bold text-slate-900 leading-tight mt-0.5">
                    {formatDeliveryDate(order.estimated_delivery)}
                  </p>
                </div>
              </div>
            </div>

            {/* Final Delivery Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Style</th>
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4">Color</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4 text-center">Quantity</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {order.delivery_items && order.delivery_items.length > 0 ? (
                    order.delivery_items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900">{item.style_name}</td>
                        <td className="py-3 px-4 text-slate-700">{item.item_name}</td>
                        <td className="py-3 px-4 text-slate-600">{item.color}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Size {item.size}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900 text-base">{item.quantity}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={`${
                            item.status === "Delivered"
                              ? "bg-green-100 text-green-800"
                              : item.status === "On the Way"
                              ? "bg-emerald-100 text-emerald-800"
                              : item.status === "Dispatched"
                              ? "bg-evenvibe-light text-evenvibe-deep"
                              : "bg-cyan-100 text-cyan-800"
                          } border-0 text-xs font-semibold px-2 py-0.5`}>
                            {item.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : null}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t border-slate-200 font-medium text-slate-800">
                  <tr>
                    <td colSpan={4} className="py-3 px-4 text-right font-semibold text-slate-700">
                      Total Delivery Quantity:
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900 text-base">
                      {order.total_delivery_quantity ?? 0}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <Package className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold text-slate-700">
              Final delivery details are not available yet.
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Once EvenVibe completes Quality Check and prepares delivery, the final approved delivery quantities will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // 2.5 BATCH-WISE DELIVERY HISTORY (INDIVIDUAL BATCHES & SPECIFIC RECORDS)
  const renderDeliveryBatchesCard = () => {
    const batches = order.delivery_batches || [];
    const hasBatches = batches.length > 0;

    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
                <Truck className="h-5 w-5 text-evenvibe-primary" /> Delivery Batches & History
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                View every delivery consignment batch dispatched for this order. Click a batch to inspect its delivered items and tracking.
              </p>
            </div>
            {hasBatches && (
              <Badge variant="outline" className="text-slate-700 bg-white border-slate-300 text-xs font-semibold">
                {batches.length} {batches.length === 1 ? "Batch" : "Batches"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {!hasBatches ? (
            <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <Package className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-semibold text-slate-700">No delivery batches recorded yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                When EvenVibe dispatches your uniform items in one or more consignment batches, each batch will appear here with full tracking and delivered item details.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Batch Selector Pills */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select Delivery Batch:
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {batches.map((batch) => {
                    const isSelected = selectedBatch?.batch_number === batch.batch_number;
                    const isDraft = batch.status === "draft";
                    const isDelivered = batch.status === "delivered";
                    const isDispatched = batch.status === "dispatched" || batch.status === "in_transit";

                    return (
                      <button
                        key={batch.id || batch.batch_number}
                        type="button"
                        onClick={() => setSelectedBatchNumber(batch.batch_number)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-evenvibe-primary/40"
                            : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-2xs"
                        }`}
                      >
                        <Package className={`w-4 h-4 ${isSelected ? "text-emerald-400" : "text-evenvibe-primary"}`} />
                        <span className="font-bold">Batch #{batch.batch_number}</span>
                        <span className="text-[11px] opacity-75 font-medium">({batch.batch_reference})</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : isDelivered
                              ? "bg-emerald-100 text-emerald-800"
                              : isDispatched
                              ? "bg-blue-100 text-blue-800"
                              : isDraft
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {isDraft ? "In Preparation" : batch.status === "in_transit" ? "On the Way" : statusLabels[batch.status] || batch.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Batch Details */}
              {selectedBatch && (
                <div className="bg-slate-50/70 rounded-xl p-4 sm:p-5 border border-slate-200/80 space-y-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-slate-900">
                          Batch #{selectedBatch.batch_number}
                        </h4>
                        <span className="text-xs text-slate-500 font-semibold">
                          ({selectedBatch.batch_reference})
                        </span>
                        <Badge
                          className={`${
                            selectedBatch.status === "delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : selectedBatch.status === "dispatched" || selectedBatch.status === "in_transit"
                              ? "bg-blue-100 text-blue-800"
                              : selectedBatch.status === "draft"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                          } border-0 text-xs font-semibold px-2 py-0.5`}
                        >
                          {selectedBatch.status === "draft"
                            ? "Active / In Preparation"
                            : statusLabels[selectedBatch.status] || selectedBatch.status}
                        </Badge>
                        {selectedBatch.status === "draft" ? (
                          <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-300 text-[10px]">
                            Currently Active Batch
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 bg-white border-slate-300 text-[10px]">
                            Historical Batch
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Batch Metrics & Logistics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Delivered Units</p>
                      <p className="text-lg font-bold text-slate-900 leading-tight mt-0.5">
                        {batchTotalDeliveredQuantity}
                        <span className="text-xs font-normal text-slate-400 ml-1">pcs</span>
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Delivered Items</p>
                      <p className="text-lg font-bold text-slate-900 leading-tight mt-0.5">
                        {batchDeliveredItems.length}
                        <span className="text-xs font-normal text-slate-400 ml-1">items</span>
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Courier Partner</p>
                      <p className="text-xs font-semibold text-slate-900 mt-1 truncate" title={selectedBatch.courier_name || "Not available"}>
                        {selectedBatch.courier_name || "Not available"}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Tracking Number</p>
                      <p className="text-xs font-semibold text-slate-900 mt-1 truncate" title={selectedBatch.tracking_number || "Not available"}>
                        {selectedBatch.tracking_number || "Not available"}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Dispatched Date</p>
                      <p className="text-xs font-semibold text-slate-900 mt-1">
                        {formatDeliveryDateTime(selectedBatch.dispatched_at)}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Delivered Date</p>
                      <p className="text-xs font-semibold text-slate-900 mt-1">
                        {formatDeliveryDateTime(selectedBatch.delivered_at)}
                      </p>
                    </div>
                  </div>

                  {/* Estimated Delivery & Remarks (if present) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 text-xs">
                      <span className="font-semibold text-slate-700">Estimated Delivery: </span>
                      <span className="text-slate-600">{formatDeliveryDate(selectedBatch.estimated_delivery)}</span>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200/80 text-xs">
                      <span className="font-semibold text-slate-700">Batch Remarks: </span>
                      <span className="text-slate-600">{selectedBatch.remarks?.trim() || "No remarks recorded for this batch."}</span>
                    </div>
                  </div>

                  {/* Batch Items Table */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                      Delivered Items in Batch #{selectedBatch.batch_number}:
                    </h5>
                    {batchDeliveredItems.length > 0 ? (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-2xs">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-4">Style</th>
                              <th className="py-3 px-4">Item</th>
                              <th className="py-3 px-4">Color</th>
                              <th className="py-3 px-4">Size</th>
                              <th className="py-3 px-4 text-center">Original Ordered</th>
                              <th className="py-3 px-4 text-center">Delivered in Batch #{selectedBatch.batch_number}</th>
                              <th className="py-3 px-4 text-center">Batch Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {batchDeliveredItems.map((item) => {
                              const origQty = item.original_quantity || 0;
                              const actQty = item.actual_quantity || 0;
                              const diff = item.difference !== undefined && item.difference !== 0 ? item.difference : (actQty - origQty);
                              const isExtra = (item.extra_quantity && item.extra_quantity > 0) || diff > 0;
                              const isShort = (item.short_quantity && item.short_quantity > 0) || diff < 0;
                              const isExact = !isExtra && !isShort && actQty > 0;
                              const extraQty = item.extra_quantity || (diff > 0 ? diff : 0);
                              const shortQty = item.short_quantity || (diff < 0 ? Math.abs(diff) : 0);

                              return (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-4 font-medium text-slate-900">{item.style_name}</td>
                                  <td className="py-3 px-4 text-slate-700">{item.item_name}</td>
                                  <td className="py-3 px-4 text-slate-600">{item.color}</td>
                                  <td className="py-3 px-4 font-medium text-slate-800">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Size {item.size}</span>
                                  </td>
                                  <td className="py-3 px-4 text-center font-medium text-slate-500">
                                    {origQty > 0 ? `${origQty} units` : "—"}
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold text-slate-900 text-base">
                                    {actQty}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {isExtra ? (
                                      <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-semibold px-2 py-0.5">
                                        +{extraQty} Extra
                                      </Badge>
                                    ) : isShort ? (
                                      <Badge className="bg-amber-100 text-amber-800 border-0 text-xs font-semibold px-2 py-0.5">
                                        -{shortQty} Short / Pending
                                      </Badge>
                                    ) : isExact ? (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs font-semibold px-2 py-0.5">
                                        Exact Match
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-slate-600">
                                        {item.classification || "Delivered"}
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-slate-50/80 border-t border-slate-200 font-medium text-slate-800">
                            <tr>
                              <td colSpan={5} className="py-3 px-4 text-right font-semibold text-slate-700">
                                Total Delivered in Batch #{selectedBatch.batch_number}:
                              </td>
                              <td className="py-3 px-4 text-center font-bold text-slate-900 text-base">
                                {batchTotalDeliveredQuantity}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-white">
                        <Package className="w-7 h-7 text-slate-400 mx-auto mb-1.5 opacity-60" />
                        <p className="text-xs font-semibold text-slate-700">No delivered items in this batch</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm mx-auto">
                          This batch does not currently have any confirmed delivered item quantities recorded.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // 3. DELIVERY DETAILS (PRIMARY SECTION)
  const renderDeliveryDetailsCard = () => (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50 border-b pb-3">
        <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
          <Truck className="h-5 w-5 text-evenvibe-primary" /> Delivery Details
        </CardTitle>
        <p className="text-xs text-slate-500">
          Courier tracking and logistics information provided by EvenVibe.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Courier / Delivery Partner</p>
            <p className="text-sm font-semibold text-slate-900">{order.courier_name || "Not available yet"}</p>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Tracking Number</p>
            <p className="text-sm font-semibold text-slate-900">{order.tracking_number || "Not available yet"}</p>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Estimated Delivery Date</p>
            <p className="text-sm font-semibold text-slate-900">{formatDeliveryDate(order.estimated_delivery)}</p>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Shipped Date</p>
            <p className="text-sm font-semibold text-slate-900">{formatDeliveryDateTime(shippedDate)}</p>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Delivered Date</p>
            <p className="text-sm font-semibold text-slate-900">{formatDeliveryDateTime(deliveredDate)}</p>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-lg border border-slate-200/80">
            <p className="text-xs font-medium text-slate-500 mb-1">Delivery Remarks</p>
            <p className="text-sm font-semibold text-slate-900">{order.delivery_remarks?.trim() || "No delivery remarks added."}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // 4. DELIVERY PROOF (PRIMARY SECTION)
  const renderDeliveryProofCard = () => (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 border-b pb-3">
        <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
          <Camera className="h-5 w-5 text-evenvibe-primary" /> Delivery Proof
        </CardTitle>
        <p className="text-xs text-slate-500">
          Photos uploaded by EvenVibe for packing, dispatch, and delivery.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        {!order.delivery_proof_images || order.delivery_proof_images.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium text-slate-600">
              No delivery proof uploaded yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {order.delivery_proof_images.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => setLightboxIndex(idx)}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 cursor-pointer transition-all"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden relative">
                  {img.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.signed_url}
                      alt={img.caption || img.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      Unavailable
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Eye className="w-5 h-5 text-white drop-shadow-md" />
                  </div>
                </div>
                <div className="p-3 flex-1 flex flex-col justify-between text-xs space-y-1.5 bg-white">
                  <p className="font-medium text-slate-900 truncate" title={img.file_name}>
                    {img.file_name}
                  </p>
                  <div className="space-y-0.5 pt-1.5 border-t border-slate-100 text-[11px] text-slate-500">
                    <p>Uploaded by {img.profiles?.role === "admin" ? "Admin" : img.profiles?.full_name || "Admin"}</p>
                    <p className="text-slate-400">{formatDeliveryDate(img.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // 5. ORIGINAL ORDER REFERENCE (SECONDARY / COLLAPSED IN DELIVERY STAGE)
  const renderOriginalOrderReferenceCard = () => (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50 border-b pb-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-slate-500" /> ORIGINAL ORDER REFERENCE
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Original requirements and sizing submitted with the order.
            </p>
          </div>
          <Badge variant="outline" className="text-slate-600 bg-white border-slate-300 text-xs font-medium">
            Reference Only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {/* Collapsible 1: Original Order Summary (Collapsed by default) */}
        <details className="group border border-slate-200 rounded-lg bg-slate-50/40 overflow-hidden text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800 px-4 py-3 flex items-center justify-between hover:bg-slate-100/60 select-none transition-colors">
            <div className="flex items-center gap-2">
              <span>Original Order Summary</span>
              <Badge variant="secondary" className="bg-slate-200/80 text-slate-700 text-xs font-normal">
                {totalItems} items originally requested
              </Badge>
            </div>
            <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200 text-xs">▼</span>
          </summary>
          <div className="p-4 bg-white border-t border-slate-200 space-y-3">
            <p className="text-xs text-slate-500">
              The quantities below represent what the school originally requested.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Total Students</p>
                <p className="text-lg font-bold text-slate-900">{order.requirement.total_students}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Total Requested Items</p>
                <p className="text-lg font-bold text-slate-900">{totalItems}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">Regular Uniforms</p>
                <p className="text-lg font-bold text-slate-900">{order.requirement.regular_uniform_students}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500">T-Shirt Uniforms</p>
                <p className="text-lg font-bold text-slate-900">{order.requirement.tshirt_uniform_students}</p>
              </div>
            </div>
          </div>
        </details>

        {/* Collapsible 2: Student Sizes (Collapsed by default) */}
        <details className="group border border-slate-200 rounded-lg bg-slate-50/40 overflow-hidden text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800 px-4 py-3 flex items-center justify-between hover:bg-slate-100/60 select-none transition-colors">
            <div className="flex items-center gap-2">
              <span>Student Sizes</span>
              <Badge variant="secondary" className="bg-slate-200/80 text-slate-700 text-xs font-normal">
                {order.tracked_students_count || order.requirement.total_students} completed
              </Badge>
            </div>
            <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200 text-xs">▼</span>
          </summary>
          <div className="p-4 bg-white border-t border-slate-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600">Total Students</span>
                <span className="font-bold text-slate-900">{order.requirement.total_students}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600">Completed Sizes</span>
                <span className="font-bold text-evenvibe-primary">{order.tracked_students_count || order.requirement.total_students}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600">Pending Sizes</span>
                <span className="font-bold text-status-warning">{order.pending_students_count || 0}</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-400 text-xs flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Students can no longer be added at the delivery stage.</span>
            </div>
            {order.is_legacy && (
              <div className="p-3 bg-slate-50 rounded-md flex gap-2 text-slate-500 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
                <p>Additional student details are not available for this previous order.</p>
              </div>
            )}
          </div>
        </details>

        {/* Collapsible 3: Quantity Details (Collapsed by default) */}
        <details className="group border border-slate-200 rounded-lg bg-slate-50/40 overflow-hidden text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800 px-4 py-3 flex items-center justify-between hover:bg-slate-100/60 select-none transition-colors">
            <div className="flex items-center gap-2">
              <span>Quantity Details</span>
              <Badge variant="secondary" className="bg-slate-200/80 text-slate-700 text-xs font-normal">
                Original breakdown
              </Badge>
            </div>
            <span className="text-slate-400 group-open:rotate-180 transition-transform duration-200 text-xs">▼</span>
          </summary>
          <div className="p-4 bg-white border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-4">
              The quantities below reflect the school&apos;s initial requirement breakdown. Active delivery uses EvenVibe&apos;s authoritative final delivery data above.
            </p>
            <div className="space-y-4">
              {Object.entries(groupedItems).sort(([a],[b]) => a.localeCompare(b)).map(([cName, sections]) => (
                <div key={cName} className="border rounded-md overflow-hidden border-slate-200 bg-white">
                  <div className="bg-slate-100 px-3 py-2 font-medium text-slate-800 capitalize border-b border-slate-200 text-xs">
                    {cName}
                  </div>
                  <div className="p-3 space-y-4">
                    {Object.entries(sections).sort(([a],[b]) => a.localeCompare(b)).map(([sName, genders]) => (
                      <div key={sName} className="space-y-2">
                        <div className="font-medium text-slate-700 text-xs">
                          Section {sName}
                        </div>
                        <div className="space-y-3 pl-3 border-l-2 border-slate-100 ml-1">
                          {Object.entries(genders).sort(([a],[b]) => a.localeCompare(b)).map(([gName, itemsByName]) => (
                            <div key={gName} className="space-y-2">
                              <div className="font-medium text-slate-500 capitalize text-[11px]">{gName}</div>
                              <div className="pl-3 space-y-2">
                                {Object.entries(itemsByName).sort(([a],[b]) => a.localeCompare(b)).map(([iName, items]) => (
                                  <div key={iName}>
                                    <div className="text-[11px] font-medium text-slate-400 mb-1">{iName}</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                      {items.sort((a,b) => a.size.localeCompare(b.size)).map((item) => (
                                        <div key={item.id} className="flex justify-between items-center bg-slate-50 px-2 py-1 rounded text-xs border border-slate-200/60">
                                          <span className="text-slate-600">Size {item.size}</span>
                                          <span className="font-semibold text-slate-900">{item.quantity}</span>
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
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );

  // 6. EARLY-STAGE VIEW (SUBMITTED -> QUALITY CHECK)
  const renderEarlyStageContent = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* STUDENT SIZES */}
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
              <span className="font-medium text-evenvibe-primary">{order.tracked_students_count || order.requirement.total_students}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-600">Pending Sizes</span>
              <span className="font-medium text-status-warning">{order.pending_students_count || 0}</span>
            </div>

            {/* ACTION AREA: Add Students to Existing Order */}
            <div className="pt-2">
              {order.status === 'submitted' || order.status === 'under_review' ? (
                order.eligible_students && order.eligible_students.length > 0 ? (
                  <Button
                    onClick={() => setAddStudentsOpen(true)}
                    className="w-full bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium flex items-center justify-center gap-2 shadow-sm"
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

        {/* ORDER SUMMARY */}
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

      {/* QUANTITY DETAILS */}
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

      {/* EARLY STAGE: ORDER PROGRESS + DELIVERY STATUS / DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {renderOrderProgressCard()}
        </div>

        <div className="space-y-6">
          {/* DELIVERY STATUS SUMMARY CARD */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-slate-900 text-base font-semibold flex items-center gap-2">
                <span>🚚</span> Delivery Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Badge className={`${statusColors[order.status] || "bg-slate-100 text-slate-800"} border-0 px-2.5 py-1 text-sm font-semibold`}>
                  {statusLabels[order.status] || order.status}
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">Tracking Number:</p>
                <p className="text-sm font-semibold text-slate-900">{order.tracking_number || "Not available yet"}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium">Estimated Delivery:</p>
                <p className="text-sm font-semibold text-slate-900">{formatDeliveryDate(order.estimated_delivery)}</p>
              </div>
            </CardContent>
          </Card>

          {/* DELIVERY DETAILS CARD */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-slate-900 text-base font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4 text-evenvibe-primary" /> Delivery Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Courier / Delivery Partner</p>
                <p className="text-sm font-medium text-slate-900">{order.courier_name || "Not available yet"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Tracking Number</p>
                <p className="text-sm font-medium text-slate-900">{order.tracking_number || "Not available yet"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Estimated Delivery</p>
                <p className="text-sm font-medium text-slate-900">{formatDeliveryDate(order.estimated_delivery)}</p>
              </div>
              
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Shipped Date</p>
                  <p className="text-sm font-medium text-slate-900">{formatDeliveryDateTime(shippedDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Delivered Date</p>
                  <p className="text-sm font-medium text-slate-900">{formatDeliveryDateTime(deliveredDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Delivery Remarks</p>
                  <p className="text-sm font-medium text-slate-900">{order.delivery_remarks?.trim() || "No delivery remarks added."}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DELIVERY BATCHES */}
      {renderDeliveryBatchesCard()}

      {/* DELIVERY PROOF */}
      {renderDeliveryProofCard()}
    </>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* ---------------------------------------------------- */}
      {/* 1. ORDER HEADER                                       */}
      {/* ---------------------------------------------------- */}
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
              <Button variant="outline" className="text-status-error hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setCancelOpen(true)}>
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
      
      {/* ORDER DATE & LAST UPDATED BAR */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-500 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div><span className="font-medium text-slate-700">Order Date:</span> {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        <div>
          <span className="font-medium text-slate-700">Last Updated:</span> 
          {order.history.length > 0 ? new Date(order.history[0].created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true }) : new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* DELIVERY-FIRST HIERARCHY vs EARLY STAGE HIERARCHY    */}
      {/* ---------------------------------------------------- */}
      {isDeliveryStage ? (
        <>
          {/* 2. ORDER PROGRESS / STATUS */}
          {renderOrderProgressCard()}

          {/* 3. FINAL DELIVERY (PRIMARY HERO SECTION) */}
          {renderFinalDeliveryCard()}

          {/* 4. DELIVERY BATCHES (BATCH-WISE HISTORY & DETAILS) */}
          {renderDeliveryBatchesCard()}

          {/* 5. DELIVERY DETAILS */}
          {renderDeliveryDetailsCard()}

          {/* 6. DELIVERY PROOF */}
          {renderDeliveryProofCard()}

          {/* 7. ORIGINAL ORDER REFERENCE (COLLAPSED / SECONDARY) */}
          {renderOriginalOrderReferenceCard()}
        </>
      ) : (
        renderEarlyStageContent()
      )}

      {/* Lightbox / Full-size Image Viewer */}
      {lightboxIndex !== null && order.delivery_proof_images && (
        <DeliveryProofLightbox
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          images={order.delivery_proof_images}
          currentIndex={lightboxIndex}
          onIndexChange={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}

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
