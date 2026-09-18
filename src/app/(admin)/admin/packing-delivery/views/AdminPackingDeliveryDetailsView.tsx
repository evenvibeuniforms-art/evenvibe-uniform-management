"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import AdminOrderQuantityBreakdown from "../../orders/views/AdminOrderQuantityBreakdown";
import {
  startPacking,
  updatePackingProgress,
  updatePackingChecklistItem,
  updatePackingRemarks,
  completePacking,
  dispatchOrder,
  markOrderInTransit,
  markOrderDelivered,
} from "../actions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  AlertCircle,
  Play,
  Edit3,
  History,
  Layers,
  Building2,
  Calendar,
  Sparkles,
  Package,
  Send,
  Navigation,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { DELIVERY_CATEGORY_LABELS, getDeliveryBadgeColor } from "./AdminPackingDeliveryListView";

export interface DynamicItemSummary {
  itemName: string;
  totalQuantity: number;
  studentCount: number | null;
}

interface OrderInfo {
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
  schools?: { id: string; name: string } | null;
  requirements?: {
    id: string;
    requirement_number: string;
    total_students: number | null;
  } | null;
}

interface ReqItem {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name: string | null;
  gender: string | null;
  item_name: string;
  size: string;
  quantity: number;
}

interface PackingRecord {
  id: string;
  order_id: string;
  status: string;
  total_quantity: number;
  packed_quantity: number;
  remarks: string | null;
  started_at: string | null;
  completed_at: string | null;
  packed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ChecklistItem {
  id: string;
  packing_record_id: string;
  item_key: string;
  label: string;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

interface PackingHistoryItem {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  changed_by: string;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string;
  } | null;
}

interface OrderStatusHistoryItem {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  created_at: string;
}

const formatDate = (dateString: string | null, includeTime = false) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const formatItemName = (name: string) => {
  if (!name) return "";
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function AdminPackingDeliveryDetailsView({
  order: initialOrder,
  requirementItems,
  qcRecord,
  packingRecord: initialPackingRecord,
  checklistItems,
  packingHistory,
  orderStatusHistory,
  totalStudents,
  dynamicItems,
}: {
  order: OrderInfo;
  requirementItems: ReqItem[];
  qcRecord: { id: string; status: string; completed_at: string | null } | null;
  packingRecord: PackingRecord | null;
  checklistItems: ChecklistItem[];
  packingHistory: PackingHistoryItem[];
  orderStatusHistory: OrderStatusHistoryItem[];
  totalStudents: number;
  dynamicItems: DynamicItemSummary[];
}) {
  const router = useRouter();

  const [order, setOrder] = useState<OrderInfo>(initialOrder);
  const [packingRecord, setPackingRecord] = useState<PackingRecord | null>(initialPackingRecord);

  // Realtime subscription for orders table
  useRealtimeSubscription({
    table: "orders",
    filter: `id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setOrder((prev) => ({
          ...prev,
          status: (updated.status as string) || prev.status,
          courier_name: (updated.courier_name as string) ?? prev.courier_name,
          tracking_number: (updated.tracking_number as string) ?? prev.tracking_number,
          estimated_delivery: (updated.estimated_delivery as string) ?? prev.estimated_delivery,
          shipped_at: (updated.shipped_at as string) ?? prev.shipped_at,
          delivered_at: (updated.delivered_at as string) ?? prev.delivered_at,
          updated_at: (updated.updated_at as string) || prev.updated_at,
        }));
        if (updated.courier_name) setCourierName(updated.courier_name as string);
        if (updated.tracking_number) setTrackingNumber(updated.tracking_number as string);
        if (updated.estimated_delivery) setEstimatedDelivery(updated.estimated_delivery as string);
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for packing_records table
  useRealtimeSubscription({
    table: "packing_records",
    filter: `order_id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.new) {
        const updated = payload.new as unknown as PackingRecord;
        setPackingRecord(updated);
        setPackedQtyInput(updated.packed_quantity || 0);
        setRemarksInput(updated.remarks || "");
        toast.info("Packing & delivery details updated in real time");
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for packing history
  useRealtimeSubscription({
    table: "packing_history",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT") {
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Dialog States
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [startRemarks, setStartRemarks] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [packedQtyInput, setPackedQtyInput] = useState(initialPackingRecord?.packed_quantity || 0);
  const [progressNote, setProgressNote] = useState("");
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);

  const [isRemarksDialogOpen, setIsRemarksDialogOpen] = useState(false);
  const [remarksInput, setRemarksInput] = useState(initialPackingRecord?.remarks || "");
  const [isUpdatingRemarks, setIsUpdatingRemarks] = useState(false);

  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [completeRemarks, setCompleteRemarks] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);

  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
  const [courierName, setCourierName] = useState(initialOrder.courier_name || "");
  const [trackingNumber, setTrackingNumber] = useState(initialOrder.tracking_number || "");
  const [estimatedDelivery, setEstimatedDelivery] = useState(initialOrder.estimated_delivery || "");
  const [isDispatching, setIsDispatching] = useState(false);

  const [isTransitDialogOpen, setIsTransitDialogOpen] = useState(false);
  const [transitNote, setTransitNote] = useState("");
  const [isMarkingTransit, setIsMarkingTransit] = useState(false);

  const [isDeliveredDialogOpen, setIsDeliveredDialogOpen] = useState(false);
  const [deliveredNote, setDeliveredNote] = useState("");
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false);

  const [updatingChecklistKey, setUpdatingChecklistKey] = useState<string | null>(null);

  // Computations
  const totalItemsCount = requirementItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const totalQuantity = packingRecord?.total_quantity ?? totalItemsCount;
  const packedQuantity = packingRecord?.packed_quantity ?? 0;
  const pendingQuantity = Math.max(0, totalQuantity - packedQuantity);
  const progressPercent = totalQuantity > 0 ? Math.min(100, Math.round((packedQuantity / totalQuantity) * 100)) : 0;

  const allChecklistCompleted =
    checklistItems.length === 5 && checklistItems.every((item) => item.is_completed);

  // Category computation
  let deliveryCategory:
    | "ready_for_packing"
    | "packing_in_progress"
    | "packed"
    | "dispatched"
    | "in_transit"
    | "delivered" = "ready_for_packing";

  if (order.status === "dispatched") {
    deliveryCategory = "dispatched";
  } else if (order.status === "in_transit") {
    deliveryCategory = "in_transit";
  } else if (order.status === "delivered") {
    deliveryCategory = "delivered";
  } else if (order.status === "packed") {
    if (!packingRecord || packingRecord.status === "pending") {
      deliveryCategory = "ready_for_packing";
    } else if (packingRecord.status === "in_progress") {
      deliveryCategory = "packing_in_progress";
    } else if (packingRecord.status === "completed") {
      deliveryCategory = "packed";
    }
  }

  // Action Handlers
  const handleStartPacking = async () => {
    setIsStarting(true);
    try {
      const res = await startPacking(order.id, startRemarks);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Packing started successfully!");
        setIsStartDialogOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to start packing");
    } finally {
      setIsStarting(false);
    }
  };

  const handleUpdateProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (packedQtyInput < 0 || packedQtyInput > totalQuantity) {
      toast.error(`Packed quantity must be between 0 and ${totalQuantity}`);
      return;
    }

    setIsUpdatingProgress(true);
    try {
      const res = await updatePackingProgress(order.id, Number(packedQtyInput), progressNote);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Packing progress updated");
        setIsProgressDialogOpen(false);
        setProgressNote("");
        router.refresh();
      }
    } catch {
      toast.error("Failed to update packing progress");
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleToggleChecklist = async (item: ChecklistItem) => {
    if (!packingRecord) return;
    if (packingRecord.status === "completed") {
      toast.info("Packing is already completed. Checklist cannot be altered.");
      return;
    }

    setUpdatingChecklistKey(item.item_key);
    try {
      const res = await updatePackingChecklistItem(
        packingRecord.id,
        item.item_key,
        !item.is_completed
      );
      if (res.error) {
        toast.error(res.error);
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Failed to update checklist item");
    } finally {
      setUpdatingChecklistKey(null);
    }
  };

  const handleUpdateRemarks = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingRemarks(true);
    try {
      const res = await updatePackingRemarks(order.id, remarksInput);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Remarks updated");
        setIsRemarksDialogOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to update remarks");
    } finally {
      setIsUpdatingRemarks(false);
    }
  };

  const handleCompletePacking = async () => {
    if (packedQuantity !== totalQuantity) {
      toast.error(`All ${totalQuantity} items must be packed before completing packing.`);
      return;
    }

    if (!allChecklistCompleted) {
      toast.error("Complete all packing checklist items before completing packing.");
      return;
    }

    setIsCompleting(true);
    try {
      const res = await completePacking(order.id, completeRemarks);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Packing completed successfully! Order is ready for dispatch.");
        setIsCompleteDialogOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to complete packing");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDispatchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierName.trim()) {
      toast.error("Courier name is required");
      return;
    }
    if (!trackingNumber.trim()) {
      toast.error("Tracking number is required");
      return;
    }
    if (!estimatedDelivery.trim()) {
      toast.error("Estimated delivery date is required");
      return;
    }

    setIsDispatching(true);
    try {
      const res = await dispatchOrder(
        order.id,
        courierName.trim(),
        trackingNumber.trim(),
        estimatedDelivery.trim()
      );
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order dispatched successfully!");
        setIsDispatchDialogOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to dispatch order");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleMarkInTransit = async () => {
    setIsMarkingTransit(true);
    try {
      const res = await markOrderInTransit(order.id, transitNote);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order marked as In Transit");
        setIsTransitDialogOpen(false);
        setTransitNote("");
        router.refresh();
      }
    } catch {
      toast.error("Failed to mark in transit");
    } finally {
      setIsMarkingTransit(false);
    }
  };

  const handleMarkDelivered = async () => {
    setIsMarkingDelivered(true);
    try {
      const res = await markOrderDelivered(order.id, deliveredNote);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order marked as Delivered!");
        setIsDeliveredDialogOpen(false);
        setDeliveredNote("");
        router.refresh();
      }
    } catch {
      toast.error("Failed to mark delivered");
    } finally {
      setIsMarkingDelivered(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Link & Header */}
      <div>
        <Link
          href="/admin/packing-delivery"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Packing & Delivery Queue
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Truck className="h-6 w-6 text-emerald-600" />
                Order {order.order_number}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs px-2.5 py-1 font-semibold ${getDeliveryBadgeColor(deliveryCategory)}`}
              >
                {DELIVERY_CATEGORY_LABELS[deliveryCategory] || deliveryCategory}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span>{order.schools?.name || "School"}</span>
              <span className="text-slate-300">•</span>
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>Ordered {formatDate(order.created_at)}</span>
            </p>
          </div>

          {/* Contextual Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Ready for Packing */}
            {deliveryCategory === "ready_for_packing" && (
              <Button
                onClick={() => {
                  setStartRemarks("");
                  setIsStartDialogOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
              >
                <Play className="h-4 w-4" />
                Start Packing
              </Button>
            )}

            {/* 2. Packing In Progress */}
            {deliveryCategory === "packing_in_progress" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPackedQtyInput(packedQuantity);
                    setProgressNote("");
                    setIsProgressDialogOpen(true);
                  }}
                  className="gap-1.5 border-slate-300"
                >
                  <Edit3 className="h-4 w-4 text-slate-600" />
                  Update Progress
                </Button>
                <Button
                  onClick={() => {
                    setCompleteRemarks(packingRecord?.remarks || "");
                    setIsCompleteDialogOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                  disabled={packedQuantity !== totalQuantity || !allChecklistCompleted}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete Packing
                </Button>
              </>
            )}

            {/* 3. Packed -> Ready for Dispatch */}
            {deliveryCategory === "packed" && (
              <Button
                onClick={() => {
                  setCourierName(order.courier_name || "");
                  setTrackingNumber(order.tracking_number || "");
                  setEstimatedDelivery(order.estimated_delivery || "");
                  setIsDispatchDialogOpen(true);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 shadow-sm"
              >
                <Send className="h-4 w-4" />
                Dispatch Order
              </Button>
            )}

            {/* 4. Dispatched -> Mark In Transit */}
            {deliveryCategory === "dispatched" && (
              <Button
                onClick={() => {
                  setTransitNote("");
                  setIsTransitDialogOpen(true);
                }}
                className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5 shadow-sm"
              >
                <Navigation className="h-4 w-4" />
                Mark In Transit
              </Button>
            )}

            {/* 5. In Transit -> Mark Delivered */}
            {deliveryCategory === "in_transit" && (
              <Button
                onClick={() => {
                  setDeliveredNote("");
                  setIsDeliveredDialogOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Delivered
              </Button>
            )}

            {/* 6. Delivered */}
            {deliveryCategory === "delivered" && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 px-3 py-1 text-sm font-medium gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Delivery Complete
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Order Quantity</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalQuantity}</p>
            <p className="text-xs text-slate-400 mt-0.5">Historical Snapshot</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Packed Quantity</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{packedQuantity}</p>
            <p className="text-xs text-slate-400 mt-0.5">Verified & Boxed</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Pending Quantity</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{pendingQuantity}</p>
            <p className="text-xs text-slate-400 mt-0.5">Remaining to Pack</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Packing Progress</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-700">{progressPercent}%</span>
              <span className="text-xs text-slate-400">({packedQuantity}/{totalQuantity})</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Grid: Order & Delivery Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order Information */}
        <Card className="border-slate-200">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600" />
              Order Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Order Number</span>
              <span className="font-semibold text-slate-900">{order.order_number}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">School</span>
              <span className="font-medium text-slate-800">{order.schools?.name || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Order Date</span>
              <span className="font-medium text-slate-800">{formatDate(order.created_at)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">QC Passed Date</span>
              <span className="font-medium text-slate-800">
                {formatDate(qcRecord?.completed_at || null, true)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Shipped Date</span>
              <span className="font-medium text-slate-800">{formatDate(order.shipped_at, true)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Delivered Date</span>
              <span className="font-medium text-slate-800">{formatDate(order.delivered_at, true)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Last Updated</span>
              <span className="font-medium text-slate-800">{formatDate(order.updated_at, true)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Details */}
        <Card className="border-slate-200">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Truck className="h-4 w-4 text-purple-600" />
              Delivery Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Courier Partner</span>
              <span className="font-semibold text-slate-900">{order.courier_name || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Tracking Number</span>
              <span className="font-mono font-medium text-slate-900">{order.tracking_number || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Estimated Delivery</span>
              <span className="font-medium text-slate-800">{formatDate(order.estimated_delivery)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Shipped Timestamp</span>
              <span className="font-medium text-slate-800">{formatDate(order.shipped_at, true)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Delivered Timestamp</span>
              <span className="font-medium text-slate-800">{formatDate(order.delivered_at, true)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Packing Checklist & Remarks Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Checklist (2 cols) */}
        <Card className="border-slate-200 md:col-span-2">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-600" />
                  Standard Packing Checklist (5 Items)
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  All 5 checklist items must be completed before final packing completion can occur.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={`text-xs ${
                  allChecklistCompleted
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {checklistItems.filter((it) => it.is_completed).length} / 5 Done
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {checklistItems.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Checklist items will be automatically initialized once packing is started.
              </p>
            ) : (
              <div className="space-y-3">
                {checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      item.is_completed
                        ? "bg-emerald-50/40 border-emerald-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Checkbox
                      id={item.id}
                      checked={item.is_completed}
                      disabled={
                        updatingChecklistKey === item.item_key ||
                        !packingRecord ||
                        packingRecord.status === "completed"
                      }
                      onCheckedChange={() => handleToggleChecklist(item)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 text-xs">
                      <label
                        htmlFor={item.id}
                        className={`font-medium cursor-pointer ${
                          item.is_completed ? "text-slate-900 line-through text-slate-500" : "text-slate-800"
                        }`}
                      >
                        {item.label}
                      </label>
                      {item.is_completed && item.completed_at && (
                        <p className="text-[11px] text-emerald-600 mt-0.5">
                          Completed on {formatDate(item.completed_at, true)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {!allChecklistCompleted && packingRecord?.status === "in_progress" && (
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs mt-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Complete all packing checklist items before completing packing.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remarks Card (1 col) */}
        <Card className="border-slate-200 flex flex-col">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-slate-600" />
                Packing Remarks
              </CardTitle>
              {packingRecord && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRemarksInput(packingRecord.remarks || "");
                    setIsRemarksDialogOpen(true);
                  }}
                  className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                >
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col justify-between">
            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
              {packingRecord?.remarks || "No packing remarks recorded yet."}
            </p>
            {packingRecord?.started_at && (
              <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 mt-4">
                Packing started: {formatDate(packingRecord.started_at, true)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historical Quantity Overview */}
      <Card className="border-slate-200">
        <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Historical Quantity Overview
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Authoritative snapshot locked upon order confirmation. Dynamic items reflect stored historical configuration.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-xs px-2.5 py-1">
                Total Students: <span className="font-bold ml-1">{totalStudents}</span>
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2.5 py-1">
                Total Items: <span className="font-bold ml-1">{totalItemsCount}</span>
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {dynamicItems.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 transition-colors"
              >
                <p className="text-xs font-medium text-slate-600 truncate" title={item.itemName}>
                  {formatItemName(item.itemName)}
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1">{item.totalQuantity}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {item.studentCount !== null ? `${item.studentCount} students` : "quantity only"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Breakdown & Timeline */}
      <Tabs defaultValue="breakdown" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="breakdown" className="flex items-center gap-1.5 text-xs">
            <Layers className="h-4 w-4" />
            Quantity Breakdown
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-xs">
            <History className="h-4 w-4" />
            Delivery Timeline
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Breakdown */}
        <TabsContent value="breakdown" className="mt-4">
          <AdminOrderQuantityBreakdown
            requirementItems={requirementItems}
            orderNumber={order.order_number}
            schoolName={order.schools?.name || "School"}
          />
        </TabsContent>

        {/* Tab 2: Timeline */}
        <TabsContent value="timeline" className="mt-4 space-y-4">
          {/* Order Status History */}
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Truck className="h-4 w-4 text-purple-600" />
                Lifecycle Transitions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {orderStatusHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No lifecycle history available.</p>
              ) : (
                <div className="space-y-3">
                  {orderStatusHistory.map((hist) => (
                    <div
                      key={hist.id}
                      className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 uppercase text-[11px] tracking-wider">
                            {hist.status.replace("_", " ")}
                          </span>
                        </div>
                        {hist.note && <p className="text-slate-600 italic mt-0.5">{hist.note}</p>}
                      </div>
                      <span className="text-slate-400 whitespace-nowrap ml-4">
                        {formatDate(hist.created_at, true)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Packing Audit History */}
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                Packing Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {packingHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No packing history available.</p>
              ) : (
                <div className="space-y-3">
                  {packingHistory.map((hist) => (
                    <div
                      key={hist.id}
                      className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {hist.from_status ? `${hist.from_status} → ` : ""}
                            {hist.to_status}
                          </span>
                          {hist.profiles?.full_name && (
                            <span className="text-slate-400">• By {hist.profiles.full_name}</span>
                          )}
                        </div>
                        {hist.note && <p className="text-slate-600 mt-0.5">{hist.note}</p>}
                      </div>
                      <span className="text-slate-400 whitespace-nowrap ml-4">
                        {formatDate(hist.created_at, true)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* DIALOGS */}
      {/* ============================================================ */}

      {/* 1. Start Packing Dialog */}
      <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Start Packing Process</DialogTitle>
            <DialogDescription>
              Initiate packing for Order {order.order_number}. This will create the official packing record and seed standard checklist items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="startRemarks">Initial Remarks (Optional)</Label>
              <Textarea
                id="startRemarks"
                placeholder="e.g. Assigned to packing station B..."
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStartDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStartPacking}
              disabled={isStarting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isStarting ? "Starting..." : "Confirm & Start Packing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Update Progress Dialog */}
      <Dialog open={isProgressDialogOpen} onOpenChange={setIsProgressDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Update Packing Progress</DialogTitle>
            <DialogDescription>
              Enter the current number of verified and packed items for this order.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProgress} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="packedQtyInput">Packed Quantity</Label>
                <span className="text-xs text-muted-foreground">Total: {totalQuantity}</span>
              </div>
              <Input
                id="packedQtyInput"
                type="number"
                min={0}
                max={totalQuantity}
                value={packedQtyInput}
                onChange={(e) => setPackedQtyInput(parseInt(e.target.value) || 0)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="progressNote">Progress Note (Optional)</Label>
              <Input
                id="progressNote"
                placeholder="e.g. Boxed 50 shirts..."
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsProgressDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingProgress} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isUpdatingProgress ? "Saving..." : "Save Progress"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Complete Packing Dialog */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Complete Packing</DialogTitle>
            <DialogDescription>
              Finalize packing for Order {order.order_number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Quantity:</span>
                <span className="font-semibold text-slate-800">{totalQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Packed Quantity:</span>
                <span className="font-semibold text-emerald-700">{packedQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Checklist Status:</span>
                <span className="font-semibold text-emerald-700">5 / 5 Completed</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="completeRemarks">Final Remarks (Optional)</Label>
              <Textarea
                id="completeRemarks"
                placeholder="e.g. All cartons sealed and labeled for dispatch."
                value={completeRemarks}
                onChange={(e) => setCompleteRemarks(e.target.value)}
                rows={3}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Once completed, the order will remain in <span className="font-semibold text-slate-800">Packed</span> status and be unlocked for Courier Dispatch.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCompletePacking}
              disabled={isCompleting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isCompleting ? "Completing..." : "Confirm & Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Dispatch Dialog */}
      <Dialog open={isDispatchDialogOpen} onOpenChange={setIsDispatchDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Dispatch Order</DialogTitle>
            <DialogDescription>
              Assign shipping courier details to dispatch Order {order.order_number}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDispatchOrder} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="courierName">Courier Name *</Label>
              <Input
                id="courierName"
                placeholder="e.g. Blue Dart, Delhivery, DTDC..."
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trackingNumber">Tracking Number *</Label>
              <Input
                id="trackingNumber"
                placeholder="e.g. BD987654321IN"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedDelivery">Estimated Delivery Date *</Label>
              <Input
                id="estimatedDelivery"
                type="date"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                required
              />
            </div>

            <div className="p-2.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-xs">
              <p className="font-medium">Once dispatched, the order will move to Dispatched.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDispatchDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isDispatching} className="bg-purple-600 hover:bg-purple-700 text-white">
                {isDispatching ? "Dispatching..." : "Confirm Dispatch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Mark In Transit Dialog */}
      <Dialog open={isTransitDialogOpen} onOpenChange={setIsTransitDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Mark Order In Transit</DialogTitle>
            <DialogDescription>
              Update status for Order {order.order_number} to In Transit once the courier pickup is confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="transitNote">Transit Note (Optional)</Label>
              <Input
                id="transitNote"
                placeholder="e.g. Package scanned at primary sorting hub..."
                value={transitNote}
                onChange={(e) => setTransitNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransitDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkInTransit}
              disabled={isMarkingTransit}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {isMarkingTransit ? "Updating..." : "Confirm In Transit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Mark Delivered Dialog */}
      <Dialog open={isDeliveredDialogOpen} onOpenChange={setIsDeliveredDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Mark Order Delivered</DialogTitle>
            <DialogDescription>
              Confirm delivery for Order {order.order_number}. This will set the final delivered timestamp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="deliveredNote">Delivery Note (Optional)</Label>
              <Input
                id="deliveredNote"
                placeholder="e.g. Received and signed by school authority..."
                value={deliveredNote}
                onChange={(e) => setDeliveredNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeliveredDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkDelivered}
              disabled={isMarkingDelivered}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isMarkingDelivered ? "Updating..." : "Confirm Delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Edit Remarks Dialog */}
      <Dialog open={isRemarksDialogOpen} onOpenChange={setIsRemarksDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Edit Packing Remarks</DialogTitle>
            <DialogDescription>Update the remarks for this packing record.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateRemarks} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="remarksInput">Remarks</Label>
              <Textarea
                id="remarksInput"
                placeholder="Enter remarks..."
                value={remarksInput}
                onChange={(e) => setRemarksInput(e.target.value)}
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRemarksDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingRemarks} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isUpdatingRemarks ? "Saving..." : "Save Remarks"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
