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
  startQualityCheck,
  updateQualityCheckProgress,
  updateQualityCheckRemarks,
  completeQualityCheck,
} from "../actions";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Edit3,
  History,
  Layers,
  Building2,
  Calendar,
  Sparkles,
  Factory,
  Truck,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export interface DynamicItemSummary {
  itemName: string;
  totalQuantity: number;
  studentCount: number | null;
}

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

interface QualityCheckRecord {
  id: string;
  order_id: string;
  status: string;
  total_quantity: number;
  checked_quantity: number;
  passed_quantity: number;
  defective_quantity: number;
  remarks: string | null;
  started_at: string | null;
  completed_at: string | null;
  checked_by: string | null;
  created_at: string;
  updated_at: string;
}

interface QCHistoryItem {
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

interface ProductionSummary {
  stage: string;
  completed_at: string | null;
  updated_at: string;
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

const getQCBadgeColor = (status: string) => {
  switch (status) {
    case "ready_for_qc":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "pending":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "passed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

const formatQCStatusLabel = (status: string) => {
  switch (status) {
    case "ready_for_qc":
      return "Ready for QC";
    case "pending":
      return "Pending Inspection";
    case "in_progress":
      return "Inspection In Progress";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
};

export default function AdminQualityCheckDetailsView({
  order: initialOrder,
  requirementItems,
  qcRecord: initialQcRecord,
  qcHistory,
  productionSummary: initialProductionSummary,
  totalStudents,
  dynamicItems,
}: {
  order: OrderInfo;
  requirementItems: ReqItem[];
  qcRecord: QualityCheckRecord | null;
  qcHistory: QCHistoryItem[];
  productionSummary: ProductionSummary | null;
  totalStudents: number;
  dynamicItems: DynamicItemSummary[];
}) {
  const router = useRouter();

  const [order, setOrder] = useState<OrderInfo>(initialOrder);
  const [qcRecord, setQcRecord] = useState<QualityCheckRecord | null>(initialQcRecord);
  const [productionSummary, setProductionSummary] = useState<ProductionSummary | null>(initialProductionSummary);

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

  // Realtime subscription for QC record changes
  useRealtimeSubscription({
    table: "quality_check_records",
    filter: `order_id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.new) {
        const updated = payload.new as unknown as QualityCheckRecord;
        setQcRecord(updated);
        setEditCheckedQty(updated.checked_quantity || 0);
        setEditPassedQty(updated.passed_quantity || 0);
        setEditDefectiveQty(updated.defective_quantity || 0);
        setEditRemarks(updated.remarks || "");
        toast.info("Quality Check details updated in real time");
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for QC history
  useRealtimeSubscription({
    table: "quality_check_history",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT") {
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for production record changes
  useRealtimeSubscription({
    table: "production_records",
    filter: `order_id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setProductionSummary((prev) =>
          prev
            ? {
                ...prev,
                stage: (updated.stage as string) || prev.stage,
                completed_at: (updated.completed_at as string) ?? prev.completed_at,
                updated_at: (updated.updated_at as string) || prev.updated_at,
              }
            : null
        );
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

  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [editCheckedQty, setEditCheckedQty] = useState<number>(initialQcRecord?.checked_quantity || 0);
  const [editPassedQty, setEditPassedQty] = useState<number>(initialQcRecord?.passed_quantity || 0);
  const [editDefectiveQty, setEditDefectiveQty] = useState<number>(initialQcRecord?.defective_quantity || 0);
  const [progressNote, setProgressNote] = useState("");
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);

  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);

  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [editRemarks, setEditRemarks] = useState(initialQcRecord?.remarks || "");
  const [isUpdatingRemarks, setIsUpdatingRemarks] = useState(false);

  // Derived Values
  const historicalTotalItems = requirementItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
  const totalQuantity = qcRecord ? qcRecord.total_quantity : historicalTotalItems;

  const isReadyForQC =
    (order.status === "production" &&
      productionSummary?.stage === "production_completed" &&
      !qcRecord) ||
    (order.status === "quality_check" && (!qcRecord || qcRecord.status === "pending"));

  const currentQCStatus = qcRecord
    ? qcRecord.status
    : isReadyForQC
    ? (order.status === "quality_check" ? "pending" : "ready_for_qc")
    : "pending";

  const checkedQuantity = qcRecord ? qcRecord.checked_quantity : 0;
  const passedQuantity = qcRecord ? qcRecord.passed_quantity : 0;
  const defectiveQuantity = qcRecord ? qcRecord.defective_quantity : 0;
  const pendingQuantity = Math.max(0, totalQuantity - checkedQuantity);

  // Progress is defined as checked / total
  const progressPercent = totalQuantity > 0 ? Math.round((checkedQuantity / totalQuantity) * 100) : 0;

  // Handlers
  const handleStartQC = async () => {
    setIsStarting(true);
    const res = await startQualityCheck(order.id, startRemarks);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Quality Check started successfully!");
      setShowStartDialog(false);
      setStartRemarks("");
      setQcRecord((prev) =>
        prev
          ? {
              ...prev,
              status: "in_progress",
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : {
              id: res.qcId || "qc-active",
              order_id: order.id,
              status: "in_progress",
              total_quantity: res.totalQuantity || totalQuantity,
              checked_quantity: 0,
              passed_quantity: 0,
              defective_quantity: 0,
              remarks: startRemarks || null,
              started_at: new Date().toISOString(),
              completed_at: null,
              checked_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
      );
      setOrder((prev) => ({ ...prev, status: "quality_check" }));
      router.refresh();
    }
    setIsStarting(false);
  };

  const handleUpdateProgress = async () => {
    if (
      !Number.isInteger(editCheckedQty) ||
      !Number.isInteger(editPassedQty) ||
      !Number.isInteger(editDefectiveQty)
    ) {
      toast.error("All quantities must be whole numbers");
      return;
    }

    if (editCheckedQty < 0 || editPassedQty < 0 || editDefectiveQty < 0) {
      toast.error("Quantities cannot be negative");
      return;
    }

    if (editCheckedQty > totalQuantity) {
      toast.error(`Checked quantity cannot exceed total quantity (${totalQuantity})`);
      return;
    }

    if (editPassedQty + editDefectiveQty !== editCheckedQty) {
      toast.error(
        "Passed and defective quantities must equal the checked quantity."
      );
      return;
    }

    setIsUpdatingProgress(true);
    const res = await updateQualityCheckProgress(
      order.id,
      editCheckedQty,
      editPassedQty,
      editDefectiveQty,
      progressNote
    );

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Quality check inspection progress saved!");
      setShowProgressDialog(false);
      setProgressNote("");
      setQcRecord((prev) =>
        prev
          ? {
              ...prev,
              checked_quantity: editCheckedQty,
              passed_quantity: editPassedQty,
              defective_quantity: editDefectiveQty,
              updated_at: new Date().toISOString(),
            }
          : null
      );
      router.refresh();
    }
    setIsUpdatingProgress(false);
  };

  const handleCompleteQC = async () => {
    const currentChecked = editCheckedQty;
    const currentPassed = editPassedQty;
    const currentDefective = editDefectiveQty;

    if (currentChecked !== totalQuantity) {
      toast.error(
        `All ${totalQuantity} items must be inspected before completion (${currentChecked} checked)`
      );
      return;
    }

    if (currentPassed + currentDefective !== currentChecked) {
      toast.error(
        `Passed (${currentPassed}) + Defective (${currentDefective}) must equal Checked (${currentChecked})`
      );
      return;
    }

    // If inputs were changed compared to qcRecord, save progress first
    if (
      qcRecord &&
      (qcRecord.checked_quantity !== currentChecked ||
        qcRecord.passed_quantity !== currentPassed ||
        qcRecord.defective_quantity !== currentDefective)
    ) {
      const saveRes = await updateQualityCheckProgress(
        order.id,
        currentChecked,
        currentPassed,
        currentDefective,
        completionNote
      );
      if (saveRes.error) {
        toast.error(`Failed to save latest progress: ${saveRes.error}`);
        return;
      }
    }

    setIsCompleting(true);
    const res = await completeQualityCheck(order.id, completionNote);

    if (res.error) {
      toast.error(res.error);
    } else {
      if (res.status === "passed") {
        toast.success("Quality Check PASSED! Order handed off to Packing.");
        setQcRecord((prev) =>
          prev
            ? {
                ...prev,
                status: "passed",
                completed_at: new Date().toISOString(),
                checked_quantity: currentChecked,
                passed_quantity: currentPassed,
                defective_quantity: currentDefective,
              }
            : null
        );
        setOrder((prev) => ({ ...prev, status: "packed" }));
      } else {
        toast.error(`Quality Check FAILED with ${res.defectiveQuantity} defective items.`);
        setQcRecord((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                completed_at: new Date().toISOString(),
                checked_quantity: currentChecked,
                passed_quantity: currentPassed,
                defective_quantity: currentDefective,
              }
            : null
        );
      }
      setShowCompleteDialog(false);
      setCompletionNote("");
      router.refresh();
    }
    setIsCompleting(false);
  };

  const handleSaveRemarks = async () => {
    setIsUpdatingRemarks(true);
    const res = await updateQualityCheckRemarks(order.id, editRemarks);
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
            onClick={() => router.push("/admin/quality-check")}
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
                className={`px-2.5 py-0.5 text-xs font-semibold ${getQCBadgeColor(currentQCStatus)}`}
              >
                {formatQCStatusLabel(currentQCStatus)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
              <Building2 className="h-3.5 w-3.5" />
              {order.schools?.name}
              <span className="text-slate-300">•</span>
              <span className="capitalize">Lifecycle: {order.status.replace(/_/g, " ")}</span>
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2">
          {(isReadyForQC || currentQCStatus === "pending" || currentQCStatus === "ready_for_qc") && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-medium"
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isStarting ? "Starting..." : "Start Inspection"}
            </Button>
          )}

          {currentQCStatus === "in_progress" && (
            <>
              <Button
                variant="outline"
                className="border-slate-300 hover:bg-slate-50 gap-1.5"
                onClick={() => {
                  setShowProgressDialog(true);
                }}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Record Inspection
              </Button>

              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm"
                disabled={editCheckedQty < totalQuantity || editPassedQty + editDefectiveQty !== editCheckedQty}
                onClick={() => {
                  if (editCheckedQty < totalQuantity) {
                    toast.error(
                      `Please inspect all ${totalQuantity} items before completing QC (${editCheckedQty} checked)`
                    );
                    return;
                  }
                  setShowCompleteDialog(true);
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Complete QC
              </Button>
            </>
          )}

          {(order.status === "packed" || currentQCStatus === "passed" || ["dispatched", "in_transit", "delivered"].includes(order.status)) && (
            <Link href={`/admin/packing-delivery/${order.id}`}>
              <Button variant="outline" size="sm" className="border-slate-300 hover:bg-slate-50 gap-1.5 text-teal-800">
                <Truck className="h-4 w-4 text-teal-600" />
                View Packing & Delivery
              </Button>
            </Link>
          )}

          <Link href={`/admin/production/${order.id}`}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-slate-900 gap-1.5">
              <Factory className="h-4 w-4" />
              Production Workspace
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none px-0 h-auto pb-1 bg-transparent space-x-6">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold"
          >
            QC Inspection Overview
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
            QC Audit Trail ({qcHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: QC Inspection Overview */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-medium">Total Quantity</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{totalQuantity}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Order snapshot</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-medium">Checked Quantity</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{checkedQuantity}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{progressPercent}% inspected</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-medium">Passed Quantity</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{passedQuantity}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Approved items</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-medium">Defective Quantity</p>
                <p className="text-2xl font-bold text-rose-700 mt-1">{defectiveQuantity}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Faulty items</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-medium">Pending Inspection</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{pendingQuantity}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Remaining</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress Bar */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                    Inspection Progress
                  </CardTitle>
                  <CardDescription>
                    {checkedQuantity} of {totalQuantity} items inspected ({progressPercent}%)
                  </CardDescription>
                </div>
                {qcRecord?.status === "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditCheckedQty(qcRecord.checked_quantity);
                      setEditPassedQty(qcRecord.passed_quantity);
                      setEditDefectiveQty(qcRecord.defective_quantity);
                      setShowProgressDialog(true);
                    }}
                    className="h-8 gap-1 text-xs"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Update Progress
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{
                    width: totalQuantity > 0 ? `${(passedQuantity / totalQuantity) * 100}%` : "0%",
                  }}
                  title={`Passed: ${passedQuantity}`}
                />
                <div
                  className="bg-rose-500 h-full transition-all duration-500"
                  style={{
                    width: totalQuantity > 0 ? `${(defectiveQuantity / totalQuantity) * 100}%` : "0%",
                  }}
                  title={`Defective: ${defectiveQuantity}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Passed: <strong>{passedQuantity}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    Defective: <strong>{defectiveQuantity}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-200 border" />
                    Pending: <strong>{pendingQuantity}</strong>
                  </span>
                </div>
                <div>
                  {qcRecord?.status === "passed" && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                      ✓ Inspection Completed & Approved
                    </Badge>
                  )}
                  {qcRecord?.status === "failed" && (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-300">
                      ✗ Inspection Failed ({defectiveQuantity} defects)
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action / Processing Section */}
          {(currentQCStatus === "pending" || currentQCStatus === "ready_for_qc") && (
            <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <Play className="h-5 w-5 text-emerald-600" />
                      Start Quality Check Inspection
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-600">
                      Total items to inspect: <strong>{totalQuantity}</strong>. Click Start Inspection to begin recording garment measurements and defect counts.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowStartDialog(true)}
                    disabled={isStarting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0 shadow-sm font-semibold"
                  >
                    {isStarting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isStarting ? "Starting..." : "Start Inspection"}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          )}

          {currentQCStatus === "in_progress" && (
            <Card className="border-indigo-100 shadow-sm">
              <CardHeader className="pb-3 bg-slate-50/70 border-b">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                      Inspection Processing
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Enter and save physical inspection results. Passed + Defective must equal Checked quantity. Total order items: <strong>{totalQuantity}</strong>.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 font-medium">
                      Pending: {Math.max(0, totalQuantity - editCheckedQty)} items
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="qc-checked-qty" className="text-xs font-semibold text-slate-700">
                      Checked Quantity
                    </Label>
                    <Input
                      id="qc-checked-qty"
                      type="number"
                      min={0}
                      max={totalQuantity}
                      value={editCheckedQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setEditCheckedQty(isNaN(val) ? 0 : val);
                      }}
                      className="text-sm font-semibold"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Total items inspected so far (0 - {totalQuantity})
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="qc-passed-qty" className="text-xs font-semibold text-emerald-700">
                      Passed Quantity
                    </Label>
                    <Input
                      id="qc-passed-qty"
                      type="number"
                      min={0}
                      max={totalQuantity}
                      value={editPassedQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setEditPassedQty(isNaN(val) ? 0 : val);
                      }}
                      className="text-sm font-semibold text-emerald-800"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Approved garments with no defects
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="qc-defective-qty" className="text-xs font-semibold text-rose-700">
                      Defective Quantity
                    </Label>
                    <Input
                      id="qc-defective-qty"
                      type="number"
                      min={0}
                      max={totalQuantity}
                      value={editDefectiveQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setEditDefectiveQty(isNaN(val) ? 0 : val);
                      }}
                      className="text-sm font-semibold text-rose-800"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Faulty garments needing alteration/rework
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qc-progress-note" className="text-xs text-slate-600">
                    Inspection Note (optional)
                  </Label>
                  <Input
                    id="qc-progress-note"
                    placeholder="e.g., Inspected batch 1; fabric check passed, checking buttons..."
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Inline Validation & Guidance */}
                {(() => {
                  if (editCheckedQty < 0 || editPassedQty < 0 || editDefectiveQty < 0) {
                    return (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Quantities cannot be negative numbers.
                      </div>
                    );
                  }
                  if (editCheckedQty > totalQuantity) {
                    return (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Checked quantity ({editCheckedQty}) cannot exceed total order quantity ({totalQuantity}).
                      </div>
                    );
                  }
                  if (editPassedQty + editDefectiveQty !== editCheckedQty) {
                    return (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Passed ({editPassedQty}) + Defective ({editDefectiveQty}) must equal Checked quantity ({editCheckedQty}). Difference: {Math.abs(editCheckedQty - (editPassedQty + editDefectiveQty))}.
                      </div>
                    );
                  }
                  if (editCheckedQty < totalQuantity) {
                    return (
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Inspection valid for {editCheckedQty} of {totalQuantity} items. Click &quot;Save Progress&quot; to update, or inspect all items to complete Quality Check.
                      </div>
                    );
                  }
                  return (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      All {totalQuantity} items inspected! {editDefectiveQty === 0 ? "Zero defects — order will advance to Packed." : `${editDefectiveQty} defective items detected — order will remain in Quality Check.`}
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUpdateProgress}
                    disabled={
                      isUpdatingProgress ||
                      editPassedQty + editDefectiveQty !== editCheckedQty ||
                      editCheckedQty < 0 ||
                      editCheckedQty > totalQuantity
                    }
                    className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 gap-2 h-9 text-xs font-semibold"
                  >
                    {isUpdatingProgress ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Edit3 className="h-3.5 w-3.5" />
                    )}
                    {isUpdatingProgress ? "Saving Progress..." : "Save Progress"}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      if (editCheckedQty !== totalQuantity) {
                        toast.error(`All ${totalQuantity} items must be inspected before completion (${editCheckedQty} checked).`);
                        return;
                      }
                      if (editPassedQty + editDefectiveQty !== editCheckedQty) {
                        toast.error("Passed and defective quantities must equal checked quantity.");
                        return;
                      }
                      setShowCompleteDialog(true);
                    }}
                    disabled={
                      isCompleting ||
                      editCheckedQty !== totalQuantity ||
                      editPassedQty + editDefectiveQty !== editCheckedQty
                    }
                    className={
                      editDefectiveQty === 0
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-9 text-xs font-semibold shadow-sm"
                        : "bg-rose-600 hover:bg-rose-700 text-white gap-2 h-9 text-xs font-semibold shadow-sm"
                    }
                  >
                    {isCompleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {isCompleting
                      ? "Completing QC..."
                      : editCheckedQty === totalQuantity
                      ? editDefectiveQty === 0
                        ? "Complete Quality Check (Pass)"
                        : "Complete Quality Check (Fail)"
                      : `Complete Quality Check (${editCheckedQty}/${totalQuantity} checked)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentQCStatus === "passed" && (
            <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-900">
                      Quality Check Completed & Passed
                    </h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      All {totalQuantity} items inspected and approved with zero defects. Completed at {formatDate(qcRecord?.completed_at || null, true)}.
                    </p>
                  </div>
                </div>
                <Link href={`/admin/packing-delivery/${order.id}`}>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 h-8 text-xs font-medium">
                    <Truck className="h-3.5 w-3.5" />
                    View Packing & Delivery
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {currentQCStatus === "failed" && (
            <Card className="border-rose-200 bg-rose-50/50 shadow-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-rose-900">
                      Quality Check Inspection Failed
                    </h4>
                    <p className="text-xs text-rose-700 mt-0.5">
                      {defectiveQuantity} of {totalQuantity} items failed inspection. Order remains in Quality Check for administrative review and rework resolution.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditRemarks(qcRecord?.remarks || "");
                    setShowRemarksDialog(true);
                  }}
                  className="border-rose-300 text-rose-800 hover:bg-rose-100 gap-1.5 h-8 text-xs font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Update QC Notes
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Grid Layout: Left Side (Order Info & Remarks) + Right Side (Historical Overview) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Order Information Card */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-600" />
                    Order Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Order Number</span>
                    <span className="font-semibold text-slate-900">{order.order_number}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">School</span>
                    <span className="font-semibold text-slate-900">{order.schools?.name}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Order Placed</span>
                    <span className="text-slate-800">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Production Completed</span>
                    <span className="text-slate-800">
                      {formatDate(productionSummary?.completed_at || null)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">QC Started</span>
                    <span className="text-slate-800">{formatDate(qcRecord?.started_at || null, true)}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-slate-800">
                      {formatDate(qcRecord?.updated_at || order.updated_at, true)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Remarks Card */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      Quality Check Remarks
                    </CardTitle>
                    {qcRecord && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditRemarks(qcRecord.remarks || "");
                          setShowRemarksDialog(true);
                        }}
                        className="h-7 text-xs text-indigo-600 hover:text-indigo-800 px-2"
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm">
                  {qcRecord?.remarks ? (
                    <p className="text-slate-800 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border text-xs leading-relaxed">
                      {qcRecord.remarks}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">
                      No remarks recorded yet. Add notes about inspected batches or defect details.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Historical Quantity Overview */}
            <div>
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
                      <p className="text-xl font-bold text-slate-900 mt-0.5">{totalStudents}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Total Items</p>
                      <p className="text-xl font-bold text-slate-900 mt-0.5">{historicalTotalItems}</p>
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
                      changes will not alter this inspection batch.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
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

        {/* Tab 3: QC Audit Trail */}
        <TabsContent value="timeline" className="mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                Quality Check Audit Trail
              </CardTitle>
              <CardDescription>
                Chronological log of inspection milestones, progress updates, and resolution events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {qcHistory.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No quality check events recorded yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {qcHistory.map((item) => (
                    <div key={item.id} className="relative group">
                      <div className="absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                      <div className="p-3.5 rounded-lg border bg-white shadow-xs space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {formatQCStatusLabel(item.to_status)}
                            </span>
                            {item.from_status && item.from_status !== item.to_status && (
                              <span className="text-xs text-muted-foreground">
                                (from {formatQCStatusLabel(item.from_status)})
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.created_at, true)}
                          </span>
                        </div>

                        {item.note && (
                          <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border">
                            {item.note}
                          </p>
                        )}

                        <div className="text-[11px] text-muted-foreground pt-0.5">
                          Logged by:{" "}
                          <span className="font-medium text-slate-800">
                            {item.profiles?.full_name || "Admin"}
                          </span>{" "}
                          ({item.profiles?.role || "evenvibe_admin"})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog 1: Start Quality Check */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-600" />
              Start Quality Check
            </DialogTitle>
            <DialogDescription>
              This will transition Order #{order.order_number} to the <strong>Quality Check</strong> stage
              and initiate the inspection process for {totalQuantity} items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="startRemarks" className="text-xs">
                Initial QC Remarks (optional)
              </Label>
              <Textarea
                id="startRemarks"
                placeholder="e.g., Batch received from stitching facility; starting fabric and seam inspection..."
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStartDialog(false)}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartQC}
              disabled={isStarting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isStarting ? "Starting..." : "Confirm & Start QC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Record Inspection Progress */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-indigo-600" />
              Record Inspection Quantities
            </DialogTitle>
            <DialogDescription>
              Update the inspected batch counts. Total items to inspect: <strong>{totalQuantity}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="checkedQty" className="text-xs font-semibold text-slate-700">
                Total Checked Quantity
              </Label>
              <Input
                id="checkedQty"
                type="number"
                min={0}
                max={totalQuantity}
                value={editCheckedQty}
                onChange={(e) => setEditCheckedQty(parseInt(e.target.value) || 0)}
              />
              <p className="text-[11px] text-muted-foreground">
                How many items have been physically checked so far (max: {totalQuantity})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="passedQty" className="text-xs font-semibold text-emerald-700">
                  Passed Quantity
                </Label>
                <Input
                  id="passedQty"
                  type="number"
                  min={0}
                  max={editCheckedQty}
                  value={editPassedQty}
                  onChange={(e) => setEditPassedQty(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="defectiveQty" className="text-xs font-semibold text-rose-700">
                  Defective Quantity
                </Label>
                <Input
                  id="defectiveQty"
                  type="number"
                  min={0}
                  max={editCheckedQty}
                  value={editDefectiveQty}
                  onChange={(e) => setEditDefectiveQty(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {editPassedQty + editDefectiveQty !== editCheckedQty && (
              <p className="text-xs text-rose-600 font-medium">
                Passed and defective quantities must equal the checked quantity.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="progressNote" className="text-xs">
                Inspection Note (optional)
              </Label>
              <Input
                id="progressNote"
                placeholder="e.g. Inspected 50 shirts; 2 had missing buttons"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProgressDialog(false)}
              disabled={isUpdatingProgress}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateProgress}
              disabled={
                isUpdatingProgress ||
                editPassedQty + editDefectiveQty !== editCheckedQty ||
                editCheckedQty < 0 ||
                editCheckedQty > totalQuantity
              }
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isUpdatingProgress ? "Saving..." : "Save Inspection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Complete Quality Check */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              Complete Quality Check
            </DialogTitle>
            <DialogDescription>
              Finalize quality inspection for Order #{order.order_number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 border rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span>Total Order Items:</span>
                <span className="font-semibold">{qcRecord?.total_quantity}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Inspected:</span>
                <span className="font-semibold">{qcRecord?.checked_quantity}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Passed Items:</span>
                <span className="font-semibold">{qcRecord?.passed_quantity}</span>
              </div>
              <div className="flex justify-between text-rose-700">
                <span>Defective Items:</span>
                <span className="font-semibold">{qcRecord?.defective_quantity}</span>
              </div>
            </div>

            {qcRecord?.defective_quantity === 0 ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                <strong>Quality Check Passed:</strong> All items passed inspection with zero defects.
                Submitting will advance this order to the <strong>Packed</strong> stage.
              </div>
            ) : (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                <strong>Quality Check Failed:</strong> {qcRecord?.defective_quantity} defective items
                detected. Order will remain in Quality Check status for administrative review.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="completionNote" className="text-xs">
                Final Resolution Note (optional)
              </Label>
              <Textarea
                id="completionNote"
                placeholder="e.g. All garments approved, moving to packing team."
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCompleteDialog(false)}
              disabled={isCompleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteQC}
              disabled={isCompleting}
              className={
                qcRecord?.defective_quantity === 0
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              }
            >
              {isCompleting
                ? "Completing..."
                : qcRecord?.defective_quantity === 0
                ? "Confirm & Pass QC"
                : "Confirm & Fail QC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Edit Remarks */}
      <Dialog open={showRemarksDialog} onOpenChange={setShowRemarksDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              Update QC Remarks
            </DialogTitle>
            <DialogDescription>
              Add or modify notes for this inspection batch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="editRemarksText" className="text-xs">
                Remarks
              </Label>
              <Textarea
                id="editRemarksText"
                placeholder="Enter quality notes, fabric batch feedback, etc."
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                rows={4}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRemarksDialog(false)}
              disabled={isUpdatingRemarks}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRemarks}
              disabled={isUpdatingRemarks}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isUpdatingRemarks ? "Saving..." : "Save Remarks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
