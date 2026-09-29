"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  Save,
  CheckCheck,
  Truck,
  ChevronDown,
  ChevronUp,
  Printer,
  Loader2,
  Package,
  History,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  calculateQualityCheck,
  StoredPackingOutputItem,
  StoredQCItem,
  QCRowStatus,
} from "@/lib/qualityCheck/qualityCheckEngine";
import {
  startQualityCheck,
  saveOrderQualityCheckItems,
  completeQualityCheck,
} from "../actions";

interface OrderInfo {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  schools?: { id: string; name: string } | null;
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
  quality_check_id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  changed_by: string;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string | null;
  } | null;
}

interface AdminQualityCheckDetailsViewProps {
  order: OrderInfo;
  packingItems: StoredPackingOutputItem[];
  qcItems: StoredQCItem[];
  qcRecord: QualityCheckRecord | null;
  qcHistory: QCHistoryItem[];
}

export default function AdminQualityCheckDetailsView({
  order,
  packingItems,
  qcItems,
  qcRecord,
  qcHistory,
}: AdminQualityCheckDetailsViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isCompletingQC, setIsCompletingQC] = useState(false);
  const isOperating = isSavingProgress || isCompletingQC || isPending;

  // Live input states: rowKey -> value string
  const [livePassedInputs, setLivePassedInputs] = useState<Record<string, string>>({});
  const [liveRemarksInputs, setLiveRemarksInputs] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Helper for friendly error messages to prevent raw PostgreSQL errors from displaying
  const formatFriendlyError = (errorMsg?: string | null): string => {
    if (!errorMsg) return "Unable to complete Quality Check. Please try again.";
    if (errorMsg.includes("Passed Quantity cannot be greater than")) {
      return "Passed Quantity cannot be greater than Packed Quantity.";
    }
    if (
      errorMsg.includes("enter Passed Quantity for all sizes") ||
      errorMsg.includes("missing")
    ) {
      return "Please enter Passed Quantity for all sizes.";
    }
    if (
      errorMsg.includes("violates check constraint") ||
      errorMsg.includes("syntax error") ||
      errorMsg.includes("relation") ||
      errorMsg.includes("RPC error")
    ) {
      return "Unable to complete Quality Check. Please try again.";
    }
    return errorMsg;
  };

  // Derive QC Calculation from authoritative packed items, saved QC items, and live inputs
  const qcData = useMemo(() => {
    return calculateQualityCheck({
      savedPackingItems: packingItems,
      savedQCItems: qcItems,
      liveInputs: {
        passedInputs: livePassedInputs,
        remarksInputs: liveRemarksInputs,
      },
    });
  }, [packingItems, qcItems, livePassedInputs, liveRemarksInputs]);

  // Section 1, 2, 6, 12, 13: Authoritative QC Completion Rule
  // QC is completed ONLY when:
  // 1. The persisted QC record status is 'completed' (or legacy 'passed')
  // 2. AND all operational sizes are complete (every row has an explicit 0 <= passed <= packed)
  // 3. AND pending === 0
  // QC is NEVER completed if pending > 0 or any operational row is missing passed quantity!
  // NEVER infer QC completion from order.status === "packed"!
  const isTrulyCompleted = Boolean(
    (qcRecord?.status === "completed" || qcRecord?.status === "passed") &&
    qcData.hasOperationalPieces &&
    qcData.allSizesComplete &&
    qcData.totalPendingPieces === 0
  );

  const qcStatus: "pending" | "in_progress" | "completed" = useMemo(() => {
    if (isTrulyCompleted) {
      return "completed";
    }
    if (
      qcRecord?.status === "in_progress" ||
      qcData.totalCheckedPieces > 0 ||
      hasUnsavedChanges
    ) {
      return "in_progress";
    }
    return "pending";
  }, [isTrulyCompleted, qcRecord?.status, qcData.totalCheckedPieces, hasUnsavedChanges]);

  const isCompleted = isTrulyCompleted;

  // Check if Start Quality Check can be shown
  const canStartQC =
    !isCompleted &&
    qcData.hasOperationalPieces &&
    (qcStatus === "pending" || !qcRecord || qcRecord.status === "pending");

  // Handle Passed input change
  const handlePassedChange = (rowKey: string, val: string) => {
    setLivePassedInputs((prev) => ({
      ...prev,
      [rowKey]: val,
    }));
    setHasUnsavedChanges(true);
  };

  // Handle Remarks input change
  const handleRemarksChange = (rowKey: string, val: string) => {
    setLiveRemarksInputs((prev) => ({
      ...prev,
      [rowKey]: val,
    }));
    setHasUnsavedChanges(true);
  };

  // Start Quality Check handler
  const handleStartQC = () => {
    if (isOperating) return;
    startTransition(async () => {
      const res = await startQualityCheck(order.id);
      if (res.error) {
        console.error("Start QC error:", res.error);
        toast.error(formatFriendlyError(res.error));
      } else {
        toast.success("Quality check started successfully.");
        router.refresh();
      }
    });
  };

  // Save Progress handler (Saves latest progress without completing)
  const handleSaveProgress = async () => {
    if (isOperating) return;

    if (!qcData.hasOperationalPieces) {
      toast.error("No operational pieces to save.");
      return;
    }

    // Build payload of all rows across groups
    const payloadItems: Array<{
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      passed_quantity: number | null;
      remarks?: string | null;
    }> = [];

    let hasClientValidationError = false;
    let clientErrorMessage = "";

    for (const group of qcData.groups) {
      for (const row of group.sizeRows) {
        if (!row.isValid) {
          hasClientValidationError = true;
          clientErrorMessage = row.errorMessage || "Please check entered quantities.";
          break;
        }

        payloadItems.push({
          item_name: group.itemName,
          style_id: group.styleId,
          style_name: group.styleName,
          color: group.color,
          size: row.size,
          passed_quantity: row.passedQuantity,
          remarks: row.remarks || null,
        });
      }
      if (hasClientValidationError) break;
    }

    if (hasClientValidationError) {
      toast.error(clientErrorMessage);
      return;
    }

    setIsSavingProgress(true);
    try {
      const res = await saveOrderQualityCheckItems(order.id, payloadItems);
      if (res.error) {
        console.error("Save QC progress error:", res.error);
        toast.error(formatFriendlyError(res.error));
      } else {
        toast.success("Quality check progress saved successfully.");
        setHasUnsavedChanges(false);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Save QC progress unexpected error:", err);
      toast.error("Unable to save Quality Check progress. Please try again.");
    } finally {
      setIsSavingProgress(false);
    }
  };

  // Complete Quality Check handler
  // STRICT SEQUENTIAL FLOW: Validate -> SAVE -> WAIT -> COMPLETE -> REFRESH
  const handleCompleteQC = async () => {
    if (isOperating) return;

    if (!qcData.canComplete) {
      if (
        qcData.totalPendingPieces > 0 ||
        qcData.totalCompletedSizesCount < qcData.totalRequiredSizesCount
      ) {
        toast.error("Please enter Passed Quantity for all sizes.");
      } else {
        toast.error("Passed Quantity cannot be greater than Packed Quantity.");
      }
      return;
    }

    // Build items payload
    const payloadItems: Array<{
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      passed_quantity: number | null;
      remarks?: string | null;
    }> = [];

    let hasValidationError = false;
    let validationErrorMessage = "";

    for (const group of qcData.groups) {
      for (const row of group.sizeRows) {
        if (!row.isValid) {
          hasValidationError = true;
          validationErrorMessage = row.errorMessage || "Please check entered quantities.";
          break;
        }
        if (row.passedQuantity === null || row.passedQuantity === undefined) {
          hasValidationError = true;
          validationErrorMessage = "Please enter Passed Quantity for all sizes.";
          break;
        }
        payloadItems.push({
          item_name: group.itemName,
          style_id: group.styleId,
          style_name: group.styleName,
          color: group.color,
          size: row.size,
          passed_quantity: row.passedQuantity,
          remarks: row.remarks || null,
        });
      }
      if (hasValidationError) break;
    }

    if (hasValidationError) {
      toast.error(validationErrorMessage);
      return;
    }

    setIsCompletingQC(true);
    try {
      // 1. SAVE QC ITEMS FIRST
      const saveRes = await saveOrderQualityCheckItems(order.id, payloadItems);
      if (saveRes.error) {
        console.error("Save QC items before completion error:", saveRes.error);
        toast.error(formatFriendlyError(saveRes.error));
        // If save fails, DO NOT call completeQualityCheck!
        return;
      }

      // 2. COMPLETE QUALITY CHECK (passing latest items to guarantee atomic DB completion)
      const completeRes = await completeQualityCheck(
        order.id,
        payloadItems,
        "Quality check completed by Admin"
      );
      if (completeRes.error) {
        console.error("Complete Quality Check error:", completeRes.error);
        toast.error(formatFriendlyError(completeRes.error));
        return;
      }

      // 3. SUCCESS & REFRESH
      toast.success("Quality Check completed successfully.");
      setHasUnsavedChanges(false);
      router.refresh();
    } catch (err: unknown) {
      console.error("Complete Quality Check unexpected error:", err);
      toast.error("Unable to complete Quality Check. Please try again.");
    } finally {
      setIsCompletingQC(false);
    }
  };

  // Helper for row status badge
  const renderRowStatusBadge = (status: QCRowStatus) => {
    switch (status) {
      case "passed":
        return (
          <Badge className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium border-0 px-2.5 py-0.5">
            Passed
          </Badge>
        );
      case "defective":
        return (
          <Badge className="bg-status-error hover:bg-rose-700 text-white font-medium border-0 px-2.5 py-0.5">
            Defective
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-evenvibe-primary hover:bg-blue-700 text-white font-medium border-0 px-2.5 py-0.5">
            Partial
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="destructive" className="font-medium px-2.5 py-0.5">
            Invalid
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary" className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium px-2.5 py-0.5">
            Pending
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/quality-check"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quality Check List
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print
          </Button>

          {isCompleted && (
            <Link href={`/admin/packing-delivery/${order.id}`}>
              <Button className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm">
                <Truck className="w-4 h-4" />
                Go to Delivery
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 3. PAGE HEADER */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs uppercase font-bold tracking-wider text-evenvibe-primary dark:-evenvibe-primary bg-evenvibe-light dark:bg-evenvibe-deep/60 px-2.5 py-1 rounded-md">
              Quality Check
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Order #{order.order_number}
            </h1>
            {/* Status Badge */}
            {isCompleted ? (
              <Badge className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium border-0 px-3 py-1 text-xs">
                QC Completed
              </Badge>
            ) : qcStatus === "in_progress" ? (
              <Badge className="bg-status-warning hover:bg-amber-700 text-white font-medium border-0 px-3 py-1 text-xs">
                QC In Progress
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium px-3 py-1 text-xs">
                Pending QC
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            School:{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {order.schools?.name || "Unknown School"}
            </span>
          </p>
        </div>

        {/* Primary Action */}
        <div className="flex items-center gap-3">
          {canStartQC && (
            <Button
              onClick={handleStartQC}
              disabled={isOperating}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-white" />
              )}
              Start Quality Check
            </Button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-2 text-evenvibe-primary dark:text-emerald-400 bg-evenvibe-light dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Ready for Delivery
            </div>
          )}
        </div>
      </div>

      {/* 4. SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Card 1: Packed Quantity */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
              Packed Quantity
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {qcData.totalPackedPieces}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Received from Packing
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Checked Quantity */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
              Checked Quantity
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-evenvibe-primary dark:-evenvibe-primary mt-1">
              {qcData.totalCheckedPieces}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Already inspected
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Passed */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-evenvibe-primary dark:text-emerald-400 tracking-wider">
              Passed
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-evenvibe-primary dark:text-emerald-400 mt-1">
              {qcData.totalPassedPieces}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Approved for delivery
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Defective */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-status-error dark:text-rose-400 tracking-wider">
              Defective
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-status-error dark:text-rose-400 mt-1">
              {qcData.totalDefectivePieces}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rejected during QC
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Pending */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 col-span-2 sm:col-span-1">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-status-warning dark:text-amber-400 tracking-wider">
              Pending
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-status-warning dark:text-amber-400 mt-1">
              {qcData.totalPendingPieces}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Remaining to inspect
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 17. SIMPLE PROGRESS SECTION */}
      {qcData.hasOperationalPieces && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300">
                Quality Check Progress
              </CardTitle>
              <span className="text-sm font-semibold text-evenvibe-primary dark:-evenvibe-primary">
                {qcData.progressPercent}% Complete
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  qcData.progressPercent === 100 ? "bg-evenvibe-primary" : "bg-evenvibe-primary"
                }`}
                style={{ width: `${qcData.progressPercent}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mt-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Inspected Sizes: </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {qcData.totalCompletedSizesCount} / {qcData.totalRequiredSizesCount}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Checked: </span>
                <span className="font-semibold text-evenvibe-primary dark:-evenvibe-primary">
                  {qcData.totalCheckedPieces} / {qcData.totalPackedPieces}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Passed: </span>
                <span className="font-semibold text-evenvibe-primary dark:text-emerald-400">
                  {qcData.totalPassedPieces}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Defective: </span>
                <span className="font-semibold text-status-error dark:text-rose-400">
                  {qcData.totalDefectivePieces}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 28. POST-COMPLETION BANNER (when QC is completed) */}
      {isCompleted && (
        <Card className="border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-evenvibe-primary dark:text-emerald-300 shrink-0">
                <CheckCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                  ✓ Quality Check Completed
                </h3>
                <p className="text-sm text-evenvibe-deep dark:text-emerald-300">
                  All {qcData.totalPackedPieces} packed pieces have been inspected. Passed:{" "}
                  <strong>{qcData.totalPassedPieces}</strong>, Defective:{" "}
                  <strong>{qcData.totalDefectivePieces}</strong>.
                </p>
              </div>
            </div>

            <Link href={`/admin/packing-delivery/${order.id}`}>
              <Button className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm px-6">
                <Truck className="w-4 h-4" />
                Go to Packing & Delivery
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* 5. QUALITY CHECK TABLE */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="p-5 md:p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-evenvibe-primary" />
                Quality Check
              </CardTitle>
              <CardDescription className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect the packed uniforms and enter the quantity that passed.
              </CardDescription>
            </div>

            {hasUnsavedChanges && !isCompleted && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 text-xs py-1">
                Unsaved changes
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Zero-Output Rule Empty State */}
          {!qcData.hasOperationalPieces ? (
            <div className="p-12 text-center space-y-3">
              <Package className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No pieces are available for Quality Check.
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Quality Check input comes strictly from the final Packed Output of the manufacturing process.
                Please ensure Stage 8 Packing has been recorded and completed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {qcData.groups.map((group) => (
                <div key={group.groupKey} className="p-5 md:p-6 space-y-4">
                  {/* Item & Style Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80 gap-2">
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                        {group.itemName}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {group.styleName && (
                          <span>
                            Style: <strong className="text-slate-700 dark:text-slate-300">{group.styleName}</strong>
                          </span>
                        )}
                        {group.color && (
                          <span>
                            Color: <strong className="text-slate-700 dark:text-slate-300">{group.color}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                      <span>Packed: <strong>{group.totalPacked}</strong></span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>Passed: <strong className="text-evenvibe-primary">{group.totalPassed}</strong></span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>Defective: <strong className="text-status-error">{group.totalDefective}</strong></span>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <span>Pending: <strong className="text-status-warning">{group.totalPending}</strong></span>
                    </div>
                  </div>

                  {/* Size Rows Table: Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-28">Size</th>
                          <th className="py-2.5 px-3 w-28 text-center">Packed</th>
                          <th className="py-2.5 px-3 w-36 text-center">Passed</th>
                          <th className="py-2.5 px-3 w-28 text-center">Defective</th>
                          <th className="py-2.5 px-3 w-28 text-center">Status</th>
                          <th className="py-2.5 px-3">Remarks (Optional)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {group.sizeRows.map((row) => {
                          const rawVal =
                            livePassedInputs[row.rowKey] !== undefined
                              ? livePassedInputs[row.rowKey]
                              : row.passedQuantity !== null
                              ? String(row.passedQuantity)
                              : "";

                          return (
                            <tr
                              key={row.rowKey}
                              className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${
                                !row.isValid ? "bg-rose-50/30 dark:bg-rose-950/10" : ""
                              }`}
                            >
                              {/* Size */}
                              <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                Size {row.size}
                              </td>

                              {/* Packed: Read Only */}
                              <td className="py-3 px-3 text-center font-medium text-slate-600 dark:text-slate-300">
                                <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-xs font-semibold">
                                  {row.packedQuantity}
                                </span>
                              </td>

                              {/* Passed: Admin Input */}
                              <td className="py-3 px-3 text-center">
                                <div className="max-w-[110px] mx-auto space-y-1">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={row.packedQuantity}
                                    value={rawVal}
                                    placeholder="Enter"
                                    disabled={isOperating || isCompleted}
                                    onChange={(e) => handlePassedChange(row.rowKey, e.target.value)}
                                    className={`h-9 text-center font-bold text-sm ${
                                      !row.isValid
                                        ? "border-status-error focus-visible:ring-status-error bg-rose-50/50"
                                        : row.passedQuantity !== null
                                        ? "border-emerald-500/80 bg-emerald-50/20"
                                        : ""
                                    }`}
                                  />
                                  {row.errorMessage && (
                                    <p className="text-[11px] text-status-error font-medium leading-tight">
                                      {row.errorMessage}
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* Defective: Automatic Read Only */}
                              <td className="py-3 px-3 text-center font-medium">
                                <span
                                  className={`px-2.5 py-1 rounded text-xs font-bold ${
                                    row.passedQuantity === null
                                      ? "text-slate-400 bg-slate-50 dark:bg-slate-800/40"
                                      : row.defectiveQuantity > 0
                                      ? "text-status-error bg-rose-50 dark:bg-rose-950/40"
                                      : "text-slate-600 bg-slate-100 dark:bg-slate-800"
                                  }`}
                                >
                                  {row.passedQuantity === null ? "—" : row.defectiveQuantity}
                                </span>
                              </td>

                              {/* Status Badge */}
                              <td className="py-3 px-3 text-center">
                                {renderRowStatusBadge(row.status)}
                              </td>

                              {/* Optional Remarks */}
                              <td className="py-3 px-3">
                                <Input
                                  type="text"
                                  placeholder="e.g. stitching flaw, loose button"
                                  value={
                                    liveRemarksInputs[row.rowKey] !== undefined
                                      ? liveRemarksInputs[row.rowKey]
                                      : row.remarks
                                  }
                                  disabled={isOperating || isCompleted}
                                  onChange={(e) => handleRemarksChange(row.rowKey, e.target.value)}
                                  className="h-8 text-xs max-w-sm"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Size Rows: Mobile Cards View */}
                  <div className="md:hidden space-y-3 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                    {group.sizeRows.map((row) => {
                      const rawVal =
                        livePassedInputs[row.rowKey] !== undefined
                          ? livePassedInputs[row.rowKey]
                          : row.passedQuantity !== null
                          ? String(row.passedQuantity)
                          : "";

                      return (
                        <MobileCard
                          key={`mob-qc-${row.rowKey}`}
                          className={`border ${
                            !row.isValid
                              ? "border-rose-400 bg-rose-50/30 dark:bg-rose-950/20"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              Size: {row.size}
                            </span>
                            {renderRowStatusBadge(row.status)}
                          </div>

                          <MobileCardField
                            label="Packed Quantity (From Packing)"
                            value={
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                                {row.packedQuantity} pieces
                              </span>
                            }
                          />

                          <MobileCardField
                            label="Passed Quantity (Admin Entered)"
                            value={
                              <div className="w-full pt-0.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={row.packedQuantity}
                                  value={rawVal}
                                  placeholder="Enter passed qty"
                                  disabled={isOperating || isCompleted}
                                  onChange={(e) => handlePassedChange(row.rowKey, e.target.value)}
                                  className={`h-9 w-full font-bold text-xs ${
                                    !row.isValid
                                      ? "border-status-error focus-visible:ring-status-error bg-rose-50/50"
                                      : row.passedQuantity !== null
                                      ? "border-emerald-500/80 bg-emerald-50/20"
                                      : ""
                                  }`}
                                />
                                {row.errorMessage && (
                                  <p className="text-[11px] text-status-error font-medium leading-tight mt-1">
                                    {row.errorMessage}
                                  </p>
                                )}
                              </div>
                            }
                          />

                          <MobileCardField
                            label="Defective Quantity (Calculated)"
                            value={
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  row.passedQuantity === null
                                    ? "text-slate-400 bg-slate-50 dark:bg-slate-800/40"
                                    : row.defectiveQuantity > 0
                                    ? "text-status-error bg-rose-50 dark:bg-rose-950/40"
                                    : "text-slate-600 bg-slate-100 dark:bg-slate-800"
                                }`}
                              >
                                {row.passedQuantity === null ? "—" : `${row.defectiveQuantity} pieces`}
                              </span>
                            }
                          />

                          <MobileCardField
                            label="Remarks (Optional)"
                            value={
                              <Input
                                type="text"
                                placeholder="e.g. stitching flaw, loose button"
                                value={
                                  liveRemarksInputs[row.rowKey] !== undefined
                                    ? liveRemarksInputs[row.rowKey]
                                    : row.remarks
                                }
                                disabled={isOperating || isCompleted}
                                onChange={(e) => handleRemarksChange(row.rowKey, e.target.value)}
                                className="h-9 text-xs w-full"
                              />
                            }
                          />
                        </MobileCard>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Footer */}
          {qcData.hasOperationalPieces && !isCompleted && (
            <div className="p-5 md:p-6 bg-slate-50/70 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                <p>
                  • <strong>Passed Quantity</strong> is entered by Admin. 0 is valid.
                </p>
                <p>
                  • <strong>Defective Quantity</strong> is calculated automatically: <em>Packed - Passed</em>.
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={handleSaveProgress}
                  disabled={isOperating}
                  className="gap-2 w-full sm:w-auto"
                >
                  {isSavingProgress ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSavingProgress ? "Saving..." : "Save QC Progress"}
                </Button>

                <Button
                  onClick={handleCompleteQC}
                  disabled={isOperating || !qcData.canComplete}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 w-full sm:w-auto shadow-sm"
                >
                  {isCompletingQC ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4" />
                  )}
                  {isCompletingQC ? "Completing..." : "Complete Quality Check"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 19. AUDIT TRAIL: Simple Collapsible "QC History" */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              QC History
            </span>
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {qcHistory.length}
            </span>
          </div>

          <div className="text-slate-400">
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showHistory && (
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800">
            {qcHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No history events recorded yet.</p>
            ) : (
              <div className="space-y-3 pt-3">
                {qcHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0 gap-1"
                  >
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.to_status === "completed"
                          ? "Quality Check Completed"
                          : item.to_status === "in_progress"
                          ? "Quality Check Started / In Progress"
                          : `Status: ${item.to_status}`}
                      </span>
                      {item.note && (
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>
                      )}
                    </div>
                    <div className="text-slate-400 shrink-0 text-[11px]">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
