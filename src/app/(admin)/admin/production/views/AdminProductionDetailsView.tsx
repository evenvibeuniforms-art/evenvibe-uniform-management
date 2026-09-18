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
  startProduction,
  updateProductionStage,
  updateProductionQuantity,
  updateProductionRemarks,
} from "../actions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Factory,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
  Edit3,
  History,
  Layers,
  Scissors,
  CheckCheck,
  Building2,
  Calendar,
  Sparkles,
  ClipboardCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";

interface OrderInfo {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  schools?: { id: string; name: string } | null;
  requirements?: {
    id: string;
    requirement_number: string;
    total_students: number | null;
    regular_uniform_students: number | null;
    tshirt_uniform_students: number | null;
  } | null;
}

interface OrderStatusEvent {
  id: string;
  status: string;
  created_at: string;
  note?: string | null;
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

interface ProductionRecord {
  id: string;
  stage: string;
  total_quantity: number;
  completed_quantity: number;
  started_at: string;
  completed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

interface StageHistoryItem {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  created_at: string;
  changed_by: string;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string;
  } | null;
}

const STAGES = [
  { key: "production_started", label: "Production Started", icon: Play, nextAction: "Move to Cutting", nextStage: "cutting" },
  { key: "cutting", label: "Cutting", icon: Scissors, nextAction: "Move to Stitching", nextStage: "stitching" },
  { key: "stitching", label: "Stitching", icon: Layers, nextAction: "Move to Finishing", nextStage: "finishing" },
  { key: "finishing", label: "Finishing", icon: Sparkles, nextAction: "Mark Production Completed", nextStage: "production_completed" },
  { key: "production_completed", label: "Production Completed", icon: CheckCheck, nextAction: null, nextStage: null },
];

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

const formatStageLabel = (stage: string) => {
  const match = STAGES.find((s) => s.key === stage);
  return match ? match.label : stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const getStageBadgeColor = (stage: string) => {
  switch (stage) {
    case "ready_to_start":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "production_started":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "cutting":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "stitching":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "finishing":
      return "bg-pink-100 text-pink-800 border-pink-200";
    case "production_completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export interface DynamicItemSummary {
  itemName: string;
  totalQuantity: number;
  studentCount: number | null;
}

const formatItemName = (name: string) => {
  if (!name) return "";
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function AdminProductionDetailsView({
  order: initialOrder,
  requirementItems,
  productionRecord: initialProductionRecord,
  stageHistory,
  orderStatusHistory,
  totalStudents,
  dynamicItems,
}: {
  order: OrderInfo;
  requirementItems: ReqItem[];
  productionRecord: ProductionRecord | null;
  stageHistory: StageHistoryItem[];
  orderStatusHistory: OrderStatusEvent[];
  totalStudents: number;
  dynamicItems: DynamicItemSummary[];
}) {
  const router = useRouter();

  const [order, setOrder] = useState<OrderInfo>(initialOrder);
  const [productionRecord, setProductionRecord] = useState<ProductionRecord | null>(initialProductionRecord);

  // Realtime subscription for order updates
  useRealtimeSubscription({
    table: "orders",
    filter: `id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setOrder((prev) => ({
          ...prev,
          status: (updated.status as string) || prev.status,
          updated_at: (updated.updated_at as string) || prev.updated_at,
        }));
      }
    },
  });

  // Realtime subscription for production record changes
  useRealtimeSubscription({
    table: "production_records",
    filter: `order_id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.new) {
        const updated = payload.new as unknown as ProductionRecord;
        setProductionRecord(updated);
        setEditCompletedQty(updated.completed_quantity || 0);
        setEditRemarks(updated.remarks || "");
        toast.info("Production details updated in real time");
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for stage history
  useRealtimeSubscription({
    table: "production_stage_history",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT") {
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Dialog States
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [startRemarks, setStartRemarks] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceNote, setAdvanceNote] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [showQtyDialog, setShowQtyDialog] = useState(false);
  const [editCompletedQty, setEditCompletedQty] = useState<number>(
    initialProductionRecord?.completed_quantity || 0
  );
  const [qtyNote, setQtyNote] = useState("");
  const [isUpdatingQty, setIsUpdatingQty] = useState(false);

  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [editRemarks, setEditRemarks] = useState(initialProductionRecord?.remarks || "");
  const [isUpdatingRemarks, setIsUpdatingRemarks] = useState(false);

  // Derived Values
  const isConfirmedReady = order.status === "confirmed" && !productionRecord;
  const currentStage = productionRecord?.stage || "ready_to_start";
  const currentStageConfig = STAGES.find((s) => s.key === currentStage);
  const currentStageIndex = STAGES.findIndex((s) => s.key === currentStage);

  const totalQuantity = productionRecord
    ? productionRecord.total_quantity
    : requirementItems.reduce((acc, item) => acc + (item.quantity || 0), 0);

  const completedQuantity = productionRecord ? productionRecord.completed_quantity : 0;
  const pendingQuantity = Math.max(0, totalQuantity - completedQuantity);
  const progressPercent = totalQuantity > 0 ? Math.round((completedQuantity / totalQuantity) * 100) : 0;

  const confirmedHistoryEvent = orderStatusHistory.find((h) => h.status === "confirmed");
  const confirmedDate = confirmedHistoryEvent ? confirmedHistoryEvent.created_at : null;

  // Handlers
  const handleStartProduction = async () => {
    setIsStarting(true);
    const res = await startProduction(order.id, startRemarks);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Production started successfully!");
      setShowStartDialog(false);
      router.refresh();
    }
    setIsStarting(false);
  };

  const handleAdvanceStage = async () => {
    if (!currentStageConfig?.nextStage) return;

    setIsAdvancing(true);
    const res = await updateProductionStage(
      order.id,
      currentStageConfig.nextStage,
      advanceNote
    );
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(`Production advanced to ${formatStageLabel(currentStageConfig.nextStage)}`);
      setShowAdvanceDialog(false);
      setAdvanceNote("");
      router.refresh();
    }
    setIsAdvancing(false);
  };

  const handleSaveQuantity = async () => {
    if (editCompletedQty < 0 || !Number.isInteger(editCompletedQty)) {
      toast.error("Please enter a valid whole number >= 0");
      return;
    }
    if (editCompletedQty > totalQuantity) {
      toast.error(`Completed quantity cannot exceed total quantity (${totalQuantity})`);
      return;
    }

    setIsUpdatingQty(true);
    const res = await updateProductionQuantity(order.id, editCompletedQty, qtyNote);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Completed quantity updated successfully");
      setShowQtyDialog(false);
      setQtyNote("");
      router.refresh();
    }
    setIsUpdatingQty(false);
  };

  const handleSaveRemarks = async () => {
    setIsUpdatingRemarks(true);
    const res = await updateProductionRemarks(order.id, editRemarks);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Remarks updated successfully");
      setShowRemarksDialog(false);
      router.refresh();
    }
    setIsUpdatingRemarks(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/admin/production")}
            className="h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Order #{order.order_number}
              </h1>
              <Badge
                variant="outline"
                className={`px-2.5 py-0.5 text-xs font-semibold ${getStageBadgeColor(
                  currentStage
                )}`}
              >
                {formatStageLabel(currentStage)}
              </Badge>
              {order.status === "production" && currentStage === "production_completed" && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs">
                  Ready for Quality Check
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
              <Building2 className="h-3.5 w-3.5" />
              {order.schools?.name}
              <span className="text-slate-300">•</span>
              <span className="capitalize">Order Lifecycle: {order.status.replace(/_/g, " ")}</span>
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          {isConfirmedReady && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
              onClick={() => setShowStartDialog(true)}
            >
              <Play className="h-4 w-4" />
              Start Production
            </Button>
          )}

          {order.status === "production" && currentStageConfig?.nextStage && (
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm"
              onClick={() => setShowAdvanceDialog(true)}
            >
              <ArrowRight className="h-4 w-4" />
              {currentStageConfig.nextAction}
            </Button>
          )}

          {productionRecord && (
            <Button
              variant="outline"
              className="border-slate-300 hover:bg-slate-50 gap-1.5"
              onClick={() => {
                setEditCompletedQty(productionRecord.completed_quantity);
                setShowQtyDialog(true);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Update Progress
            </Button>
          )}

          {currentStage === "production_completed" && order.status === "production" && (
            <Link href={`/admin/quality-check/${order.id}`}>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
                <ClipboardCheck className="h-4 w-4" />
                Go to Quality Check
              </Button>
            </Link>
          )}

          {["quality_check", "packed", "dispatched", "in_transit", "delivered"].includes(order.status) && (
            <Link href={`/admin/quality-check/${order.id}`}>
              <Button variant="outline" className="border-slate-300 hover:bg-slate-50 gap-1.5 text-emerald-800">
                <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                View Quality Check
              </Button>
            </Link>
          )}

          {["packed", "dispatched", "in_transit", "delivered"].includes(order.status) && (
            <Link href={`/admin/packing-delivery/${order.id}`}>
              <Button variant="outline" className="border-slate-300 hover:bg-slate-50 gap-1.5 text-teal-800">
                <Truck className="h-4 w-4 text-teal-600" />
                View Packing & Delivery
              </Button>
            </Link>
          )}

          <Link href={`/admin/orders/${order.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-slate-900"
            >
              View Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none px-0 h-auto pb-1 bg-transparent space-x-6">
          <TabsTrigger
            value="progress"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold"
          >
            Production Progress
          </TabsTrigger>
          <TabsTrigger
            value="breakdown"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold"
          >
            Quantity Breakdown
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold"
          >
            Production Timeline ({stageHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Progress & Overview */}
        <TabsContent value="progress" className="space-y-6 mt-6">
          {/* Production Progress Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Factory className="h-5 w-5 text-emerald-600" />
                    Manufacturing Workflow Stepper
                  </CardTitle>
                  <CardDescription>
                    Sequential stages of production from start to completion.
                  </CardDescription>
                </div>
                {productionRecord && (
                  <Badge variant="outline" className="text-xs bg-white">
                    {progressPercent}% Completed
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              {/* Visual Stage Stepper */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative">
                {STAGES.map((s, idx) => {
                  const Icon = s.icon;
                  const isCurrent = currentStage === s.key;
                  const isCompleted = currentStageIndex > idx;

                  return (
                    <div
                      key={s.key}
                      className={`relative p-3 rounded-lg border transition-all flex flex-col items-center text-center gap-2 ${
                        isCurrent
                          ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm"
                          : isCompleted
                          ? "bg-slate-50 border-slate-200 text-slate-700"
                          : "bg-white border-slate-100 text-slate-400 opacity-60"
                      }`}
                    >
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                          isCurrent
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                            : isCompleted
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            isCurrent ? "text-emerald-900" : isCompleted ? "text-slate-800" : "text-slate-400"
                          }`}
                        >
                          {s.label}
                        </p>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {isCurrent ? "In Progress" : isCompleted ? "Completed" : `Step ${idx + 1}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Counters & Bar */}
              <div className="bg-slate-50 rounded-xl p-5 border space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="bg-white p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground font-medium">Total Quantity</p>
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100">
                    <p className="text-xs text-emerald-700 font-medium">Completed</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-0.5">{completedQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-700 font-medium">Pending</p>
                    <p className="text-2xl font-bold text-amber-600 mt-0.5">{pendingQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground font-medium">Progress Rate</p>
                    <p className="text-2xl font-bold text-indigo-600 mt-0.5">{progressPercent}%</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Overall Progress</span>
                    <span>{progressPercent}% completed</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Remarks Section */}
              <div className="flex items-start justify-between p-4 rounded-lg border bg-white gap-4">
                <div className="space-y-1 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Production Remarks
                  </p>
                  <p className="text-sm text-slate-800 italic">
                    {productionRecord?.remarks || "No remarks recorded yet."}
                  </p>
                </div>
                {productionRecord && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => {
                      setEditRemarks(productionRecord.remarks || "");
                      setShowRemarksDialog(true);
                    }}
                  >
                    Edit Remarks
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2-Column Info Grid: Order Info & Quantity Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Order Info Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-600" />
                  Order Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm divide-y">
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">Order Number</span>
                  <span className="font-semibold text-slate-900">{order.order_number}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">School</span>
                  <span className="font-medium text-slate-800">{order.schools?.name}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Order Date</span>
                  <span className="text-slate-800">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Confirmed Date</span>
                  <span className="text-slate-800">{formatDate(confirmedDate)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Production Started</span>
                  <span className="text-slate-800">{formatDate(productionRecord?.started_at || null, true)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Production Completed</span>
                  <span className="text-slate-800">{formatDate(productionRecord?.completed_at || null, true)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="text-slate-800">
                    {formatDate(productionRecord?.updated_at || order.updated_at, true)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quantity Overview Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-slate-600" />
                  Historical Quantity Overview
                </CardTitle>
                <CardDescription>
                  Snapshot from Requirement #{order.requirements?.requirement_number}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Total Students</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {totalStudents}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Total Items</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {requirementItems.reduce((acc, item) => acc + (item.quantity || 0), 0)}
                    </p>
                  </div>
                  {dynamicItems.map((item) => (
                    <div
                      key={item.itemName}
                      className="p-3 bg-slate-50 rounded-lg border text-center"
                    >
                      <p
                        className="text-xs text-muted-foreground font-medium truncate"
                        title={formatItemName(item.itemName)}
                      >
                        {formatItemName(item.itemName)}
                      </p>
                      <p className="text-lg font-semibold text-slate-800 mt-0.5">
                        {item.studentCount !== null
                          ? `${item.studentCount} ${item.studentCount === 1 ? "student" : "students"}`
                          : "—"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Quantities are locked historical records from order submission. Future student
                    changes will not alter this production batch.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Quantity Breakdown */}
        <TabsContent value="breakdown" className="mt-6">
          <AdminOrderQuantityBreakdown
            requirementItems={requirementItems}
            orderNumber={order.order_number}
            schoolName={order.schools?.name || "School"}
          />
        </TabsContent>

        {/* Tab 3: Timeline */}
        <TabsContent value="timeline" className="mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                Production Audit Trail
              </CardTitle>
              <CardDescription>
                Chronological log of manufacturing stage updates, milestones, and remarks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stageHistory.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No production events recorded yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {stageHistory.map((item) => (
                    <div key={item.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                      <div className="p-3.5 rounded-lg border bg-white shadow-xs space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {formatStageLabel(item.to_stage)}
                            </span>
                            {item.from_stage && item.from_stage !== item.to_stage && (
                              <span className="text-xs text-muted-foreground">
                                (from {formatStageLabel(item.from_stage)})
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatDate(item.created_at, true)}
                          </span>
                        </div>
                        {item.note && (
                          <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                            {item.note}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Updated by: {item.profiles?.full_name || "EvenVibe Admin"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog 1: Start Production Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Play className="h-5 w-5 text-emerald-600" />
              Start Production
            </DialogTitle>
            <DialogDescription>
              Initiate manufacturing for Order #{order.order_number}. This will transition the
              order lifecycle to Production and lock in the historical batch quantity ({totalQuantity} items).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="startRemarks">Initial Remarks (Optional)</Label>
              <Textarea
                id="startRemarks"
                placeholder="e.g., Fabric sourced, sent to cutting department..."
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStartDialog(false)}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleStartProduction}
              disabled={isStarting}
            >
              {isStarting ? "Starting..." : "Confirm & Start Production"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Advance Stage Dialog */}
      <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ArrowRight className="h-5 w-5 text-indigo-600" />
              {currentStageConfig?.nextAction}
            </DialogTitle>
            <DialogDescription>
              Move manufacturing progress from{" "}
              <strong>{formatStageLabel(currentStage)}</strong> to{" "}
              <strong>{currentStageConfig?.nextStage ? formatStageLabel(currentStageConfig.nextStage) : ""}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="advanceNote">Stage Note / Remarks (Optional)</Label>
              <Textarea
                id="advanceNote"
                placeholder="e.g., Cutting verified by team lead..."
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAdvanceDialog(false)}
              disabled={isAdvancing}
            >
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleAdvanceStage}
              disabled={isAdvancing}
            >
              {isAdvancing ? "Updating..." : "Advance Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Update Progress / Completed Quantity Dialog */}
      <Dialog open={showQtyDialog} onOpenChange={setShowQtyDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="h-5 w-5 text-emerald-600" />
              Update Production Progress
            </DialogTitle>
            <DialogDescription>
              Record completed items manufactured so far. Total required: {totalQuantity} items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="completedQty">Completed Quantity (0 to {totalQuantity})</Label>
              <Input
                id="completedQty"
                type="number"
                min="0"
                max={totalQuantity}
                value={editCompletedQty}
                onChange={(e) => setEditCompletedQty(parseInt(e.target.value) || 0)}
              />
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>
                  Pending:{" "}
                  <strong>{Math.max(0, totalQuantity - editCompletedQty)}</strong> items
                </span>
                <span>
                  Progress:{" "}
                  <strong>
                    {totalQuantity > 0 ? Math.round((editCompletedQty / totalQuantity) * 100) : 0}%
                  </strong>
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qtyNote">Progress Note (Optional)</Label>
              <Input
                id="qtyNote"
                placeholder="e.g., Batch 1 of shirts stitched..."
                value={qtyNote}
                onChange={(e) => setQtyNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowQtyDialog(false)}
              disabled={isUpdatingQty}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSaveQuantity}
              disabled={isUpdatingQty}
            >
              {isUpdatingQty ? "Saving..." : "Save Progress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Edit Remarks Dialog */}
      <Dialog open={showRemarksDialog} onOpenChange={setShowRemarksDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Edit Production Remarks</DialogTitle>
            <DialogDescription>
              Update internal operational notes for this production order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="remarksInput">Remarks</Label>
              <Textarea
                id="remarksInput"
                placeholder="Enter internal manufacturing remarks..."
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRemarksDialog(false)}
              disabled={isUpdatingRemarks}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSaveRemarks}
              disabled={isUpdatingRemarks}
            >
              {isUpdatingRemarks ? "Saving..." : "Save Remarks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
