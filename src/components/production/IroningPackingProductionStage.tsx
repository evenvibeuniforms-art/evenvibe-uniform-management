"use client";

import React, { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Shirt,
  PackageCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  Save,
  Printer,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  OrderWorkflowStage,
  ProductionStageKey,
} from "@/lib/productionWorkflow";
import { StoredCheckingItem } from "@/lib/production/checkingEngine";
import {
  StoredIroningPackingItem,
  calculateIroningStep,
  calculatePackingStep,
  isIroningStepCompleted,
} from "@/lib/production/ironingPackingEngine";
import {
  saveOrderIroningItemsAction,
  completeOrderIroningStepAction,
  saveOrderPackingItemsAction,
  completeOrderPackingStepAction,
} from "@/app/(admin)/admin/production/actions";
import {
  downloadIroningExcel,
  downloadPackingExcel,
} from "@/lib/production/exportIroningPackingExcel";

interface IroningPackingProductionStageProps {
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  workflows?: OrderWorkflowStage[] | null;
  savedCheckingItems: StoredCheckingItem[];
  savedIroningPackingItems: StoredIroningPackingItem[];
  currentStage: ProductionStageKey | string;
  isLocked?: boolean;
  onIroningPackingUpdated?: (updated: StoredIroningPackingItem[]) => void;
  onWorkflowUpdated?: (updated: OrderWorkflowStage[]) => void;
  onStageAdvanced?: () => void;
  onPrint?: (mode: "ironing" | "packing" | "combined") => void;
}

export default function IroningPackingProductionStage({
  orderId,
  orderNumber,
  schoolName = "School",
  workflows,
  savedCheckingItems,
  savedIroningPackingItems,
  isLocked = false,
  onIroningPackingUpdated,
  onWorkflowUpdated,
  onStageAdvanced,
  onPrint,
}: IroningPackingProductionStageProps) {
  const router = useRouter();
  const [isSavingIroning, startSavingIroning] = useTransition();
  const [isCompletingIroning, startCompletingIroning] = useTransition();
  const [isSavingPacking, startSavingPacking] = useTransition();
  const [isCompletingPacking, startCompletingPacking] = useTransition();

  const [liveIronedInputs, setLiveIronedInputs] = useState<Record<string, string>>({});
  const [liveIroningRemarks, setLiveIroningRemarks] = useState<Record<string, string>>({});
  const [livePackedInputs, setLivePackedInputs] = useState<Record<string, string>>({});
  const [livePackingRemarks, setLivePackingRemarks] = useState<Record<string, string>>({});
  const [optimisticIroningCompletedAt, setOptimisticIroningCompletedAt] = useState<string | null>(null);

  // Workflow for stage 8
  const stage8Workflow = (workflows || []).find(
    (w) => w.stage_key === "ironing_packing" || w.sequence_order === 8
  );
  const effectiveStage8Workflow = useMemo(() => {
    if (!stage8Workflow) return null;
    if (optimisticIroningCompletedAt) {
      return { ...stage8Workflow, ironing_completed_at: optimisticIroningCompletedAt };
    }
    return stage8Workflow;
  }, [stage8Workflow, optimisticIroningCompletedAt]);

  const isStage8Completed = effectiveStage8Workflow?.status === "completed";
  const isIroningDone = isIroningStepCompleted(
    effectiveStage8Workflow,
    savedIroningPackingItems,
    savedCheckingItems
  );

  // Split saved items
  const savedIroningItems = useMemo(
    () => savedIroningPackingItems.filter((i) => i.stage_key === "ironing"),
    [savedIroningPackingItems]
  );
  const savedPackingItems = useMemo(
    () => savedIroningPackingItems.filter((i) => i.stage_key === "packing"),
    [savedIroningPackingItems]
  );

  // 1. Calculate Ironing Step
  const ironingResult = useMemo(() => {
    return calculateIroningStep({
      savedCheckingItems,
      savedIroningItems,
      liveInputs: {
        ironedInputs: liveIronedInputs,
        remarksInputs: liveIroningRemarks,
      },
    });
  }, [savedCheckingItems, savedIroningItems, liveIronedInputs, liveIroningRemarks]);

  // 2. Calculate Packing Step
  const packingResult = useMemo(() => {
    return calculatePackingStep({
      isIroningCompleted: isIroningDone,
      savedIroningItems,
      savedPackingItems,
      liveInputs: {
        packedInputs: livePackedInputs,
        remarksInputs: livePackingRemarks,
      },
    });
  }, [isIroningDone, savedIroningItems, savedPackingItems, livePackedInputs, livePackingRemarks]);

  // Ironing input change
  const handleIronedChange = (rowKey: string, rawVal: string) => {
    setLiveIronedInputs((prev) => ({ ...prev, [rowKey]: rawVal }));
  };

  const handleIroningRemarksChange = (rowKey: string, rawVal: string) => {
    setLiveIroningRemarks((prev) => ({ ...prev, [rowKey]: rawVal }));
  };

  // Packing input change
  const handlePackedChange = (rowKey: string, rawVal: string) => {
    setLivePackedInputs((prev) => ({ ...prev, [rowKey]: rawVal }));
  };

  const handlePackingRemarksChange = (rowKey: string, rawVal: string) => {
    setLivePackingRemarks((prev) => ({ ...prev, [rowKey]: rawVal }));
  };

  // -------------------------------------------------------------------------
  // Handlers: Save & Complete Ironing
  // -------------------------------------------------------------------------
  const handleSaveIroning = () => {
    const itemsToSave: Array<{
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      input_quantity?: number | null;
      actual_quantity: number;
      remarks?: string | null;
    }> = [];

    let hasInvalid = false;
    ironingResult.groups.forEach((group) => {
      group.sizeRows.forEach((row) => {
        if (row.actualQuantity !== null) {
          if (row.actualQuantity < 0 || row.actualQuantity > row.inputQuantity) {
            hasInvalid = true;
          }
          itemsToSave.push({
            item_name: group.itemName,
            style_id: group.styleId,
            style_name: group.styleName,
            color: group.color,
            size: row.size,
            input_quantity: row.inputQuantity,
            actual_quantity: row.actualQuantity,
            remarks: row.remarks,
          });
        }
      });
    });

    if (hasInvalid) {
      toast.error("Please fix invalid ironed quantities before saving.");
      return;
    }

    if (itemsToSave.length === 0) {
      toast.info("No ironed quantities entered to save.");
      return;
    }

    startSavingIroning(async () => {
      const res = await saveOrderIroningItemsAction(orderId, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Ironing progress saved successfully.");
        // Optimistic update of local saved items
        const updatedSaved: StoredIroningPackingItem[] = [
          ...savedIroningPackingItems.filter((i) => i.stage_key !== "ironing"),
          ...itemsToSave.map((it) => ({
            order_id: orderId,
            stage_key: "ironing" as const,
            item_name: it.item_name,
            style_id: it.style_id,
            style_name: it.style_name,
            color: it.color,
            size: it.size,
            input_quantity: it.input_quantity || 0,
            actual_quantity: it.actual_quantity,
            pending_quantity: (it.input_quantity || 0) - it.actual_quantity,
            remarks: it.remarks,
            status: (it.input_quantity || 0) === it.actual_quantity ? "complete" : "pending",
          })),
        ];
        onIroningPackingUpdated?.(updatedSaved);

        if (res.isIroningCompleted) {
          const nowIso = new Date().toISOString();
          setOptimisticIroningCompletedAt(nowIso);
          if (workflows) {
            const updatedWfs = workflows.map((w) =>
              w.stage_key === "ironing_packing" || w.sequence_order === 8
                ? { ...w, ironing_completed_at: w.ironing_completed_at || nowIso }
                : w
            );
            onWorkflowUpdated?.(updatedWfs);
          }
        }

        router.refresh();
      }
    });
  };

  const handleCompleteIroning = () => {
    if (!ironingResult.allSizesComplete || !ironingResult.canComplete) {
      toast.error("Complete ironing for all required quantities before continuing.");
      return;
    }

    startCompletingIroning(async () => {
      // First save all rows
      const itemsToSave = ironingResult.groups.flatMap((grp) =>
        grp.sizeRows.map((r) => ({
          item_name: grp.itemName,
          style_id: grp.styleId,
          style_name: grp.styleName,
          color: grp.color,
          size: r.size,
          input_quantity: r.inputQuantity,
          actual_quantity: r.actualQuantity as number,
          remarks: r.remarks,
        }))
      );

      const saveRes = await saveOrderIroningItemsAction(orderId, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        return;
      }

      const compRes = await completeOrderIroningStepAction(orderId);
      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success("Ironing step completed! Packing operation is now unlocked.");
        const nowIso = compRes.ironingCompletedAt || new Date().toISOString();
        setOptimisticIroningCompletedAt(nowIso);
        if (workflows) {
          const updatedWfs = workflows.map((w) =>
            w.stage_key === "ironing_packing" || w.sequence_order === 8
              ? { ...w, ironing_completed_at: nowIso }
              : w
          );
          onWorkflowUpdated?.(updatedWfs);
        }
        onStageAdvanced?.();
        router.refresh();
      }
    });
  };

  // -------------------------------------------------------------------------
  // Handlers: Save & Complete Packing
  // -------------------------------------------------------------------------
  const handleSavePacking = () => {
    const itemsToSave: Array<{
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      input_quantity?: number | null;
      actual_quantity: number;
      remarks?: string | null;
    }> = [];

    let hasInvalid = false;
    packingResult.groups.forEach((group) => {
      group.sizeRows.forEach((row) => {
        if (row.actualQuantity !== null) {
          if (row.actualQuantity < 0 || row.actualQuantity > row.inputQuantity) {
            hasInvalid = true;
          }
          itemsToSave.push({
            item_name: group.itemName,
            style_id: group.styleId,
            style_name: group.styleName,
            color: group.color,
            size: row.size,
            input_quantity: row.inputQuantity,
            actual_quantity: row.actualQuantity,
            remarks: row.remarks,
          });
        }
      });
    });

    if (hasInvalid) {
      toast.error("Please fix invalid packed quantities before saving.");
      return;
    }

    if (itemsToSave.length === 0) {
      toast.info("No packed quantities entered to save.");
      return;
    }

    startSavingPacking(async () => {
      const res = await saveOrderPackingItemsAction(orderId, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Packing progress saved successfully.");
        const updatedSaved: StoredIroningPackingItem[] = [
          ...savedIroningPackingItems.filter((i) => i.stage_key !== "packing"),
          ...itemsToSave.map((it) => ({
            order_id: orderId,
            stage_key: "packing" as const,
            item_name: it.item_name,
            style_id: it.style_id,
            style_name: it.style_name,
            color: it.color,
            size: it.size,
            input_quantity: it.input_quantity || 0,
            actual_quantity: it.actual_quantity,
            pending_quantity: (it.input_quantity || 0) - it.actual_quantity,
            remarks: it.remarks,
            status: (it.input_quantity || 0) === it.actual_quantity ? "complete" : "pending",
          })),
        ];
        onIroningPackingUpdated?.(updatedSaved);
        router.refresh();
      }
    });
  };

  const handleCompletePacking = () => {
    if (!packingResult.allSizesComplete || !packingResult.canComplete) {
      toast.error("Complete packing for all required quantities before continuing.");
      return;
    }

    startCompletingPacking(async () => {
      // First save all rows
      const itemsToSave = packingResult.groups.flatMap((grp) =>
        grp.sizeRows.map((r) => ({
          item_name: grp.itemName,
          style_id: grp.styleId,
          style_name: grp.styleName,
          color: grp.color,
          size: r.size,
          input_quantity: r.inputQuantity,
          actual_quantity: r.actualQuantity as number,
          remarks: r.remarks,
        }))
      );

      const saveRes = await saveOrderPackingItemsAction(orderId, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        return;
      }

      const compRes = await completeOrderPackingStepAction(orderId);
      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success("Production manufacturing completed! Order status is now Packed.");
        onStageAdvanced?.();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* 1. TOP HEADER & PROGRESS SUMMARY CARD */}
      <Card className="border-slate-200/80 shadow-xs bg-white overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-amber-50/70 via-white to-indigo-50/60 border-b border-slate-100 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-status-warning text-white font-semibold text-[11px] px-2.5 py-0.5 rounded-full shadow-2xs">
                  STAGE 8 (FINAL STAGE)
                </Badge>
                {isStage8Completed ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[11px]">
                    ✓ PACKED & COMPLETED
                  </Badge>
                ) : isIroningDone ? (
                  <Badge className="bg-evenvibe-light text-evenvibe-deep -evenvibe-primary font-semibold text-[11px]">
                    PACKING IN PROGRESS
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-[11px]">
                    IRONING IN PROGRESS
                  </Badge>
                )}
              </div>
              <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2 mt-1">
                <Shirt className="h-5 w-5 text-status-warning" />
                Ironing & Packing Production Stage
              </CardTitle>
              <CardDescription className="text-xs text-slate-600">
                Final manufacturing stage. Consumes only <strong>Passed pieces</strong> from Checking. Rejected pieces ({savedCheckingItems.reduce((acc, c) => acc + (c.reject_quantity || 0), 0)} pcs) are preserved in history and never enter Stage 8.
              </CardDescription>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadIroningExcel({ orderNumber, schoolName, ironingResult })}
                disabled={!ironingResult.hasOperationalPieces}
                className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 w-full sm:w-auto"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-status-warning" />
                Ironing Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPackingExcel({ orderNumber, schoolName, packingResult })}
                disabled={packingResult.isLocked || !packingResult.hasOperationalPieces}
                className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 w-full sm:w-auto"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-evenvibe-primary" />
                Packing Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPrint?.("combined")}
                disabled={!ironingResult.hasOperationalPieces}
                className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 w-full sm:w-auto"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" />
                Print Stage 8
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 2. SECTION 1: IRONING OPERATION */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-amber-50/50 border-b border-amber-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wide">
                <Shirt className="h-4 w-4 text-status-warning" />
                Step 1: Industrial Ironing & Pressing
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Input is read-only (Checking Passed Quantity). Admin enters <strong>Ironed Quantity</strong>.
              </p>
            </div>
            {isIroningDone && (
              <Badge className="bg-evenvibe-primary text-white font-bold text-xs px-2.5 py-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ironing Completed ✓
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Ironing Metrics 4-Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                Total Input (Passed)
              </span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {ironingResult.totalInputPieces}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Physical pieces from Checking
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide block">
                Ironed Pieces
              </span>
              <span className="text-2xl font-black text-amber-900 mt-1 block">
                {ironingResult.totalIronedPieces}
              </span>
              <span className="text-[10px] text-amber-700 block mt-0.5">
                Admin entered quantity
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/60 shadow-2xs">
              <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wide block">
                Pending Pieces
              </span>
              <span className="text-2xl font-black text-rose-900 mt-1 block">
                {ironingResult.totalPendingPieces}
              </span>
              <span className="text-[10px] text-rose-700 block mt-0.5">
                Input − Ironed Quantity
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                Ironing Progress
              </span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">
                {ironingResult.totalCompletedSizesCount} / {ironingResult.totalRequiredSizesCount}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {ironingResult.allSizesComplete ? "100% Complete" : "Sizes Incomplete"}
              </span>
            </div>
          </div>

          {/* Empty state: No pieces available for ironing */}
          {!ironingResult.hasOperationalPieces ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60">
              <AlertCircle className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">
                {ironingResult.emptyStateMessage || "No pieces are available for ironing."}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Previous checking stage did not produce any passed physical output for this order.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {ironingResult.groups.map((grp) => (
                <div
                  key={grp.groupKey}
                  className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs bg-white"
                >
                  {/* Group Header */}
                  <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{grp.itemName}</span>
                      <span className="text-xs text-slate-500">—</span>
                      <span className="text-xs font-semibold text-slate-700">
                        Style: {grp.styleName || "Standard"}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600">
                        Color: <strong className="text-slate-800">{grp.color || "Standard"}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">
                        Input: <strong className="text-slate-900">{grp.totalInput}</strong>
                      </span>
                      <span className="text-amber-800">
                        Ironed: <strong>{grp.totalActual}</strong>
                      </span>
                      <span className="text-rose-800">
                        Pending: <strong>{grp.totalPending}</strong>
                      </span>
                      {grp.isGroupComplete ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] px-1.5 py-0">
                          Complete ✓
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                          Incomplete
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Operational Ironing Table: Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/40 text-slate-600 border-b border-slate-200">
                          <th className="py-2.5 px-4 font-semibold w-24">Size</th>
                          <th className="py-2.5 px-4 font-semibold w-36 text-center">
                            Input from Checking 🔒
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-40 text-center">
                            Ironed Quantity ✏️
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-32 text-center">
                            Pending 🔒
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-32 text-center">Status</th>
                          <th className="py-2.5 px-4 font-semibold">Remarks (Optional)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grp.sizeRows.map((row) => (
                          <tr
                            key={row.rowKey}
                            className={`hover:bg-slate-50/50 transition-colors ${
                              row.status === "invalid" ? "bg-rose-50/40" : ""
                            }`}
                          >
                            {/* Size */}
                            <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                              {row.size}
                            </td>

                            {/* Input from Checking (READ ONLY) */}
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs">
                                <Lock className="h-3 w-3 text-slate-400" />
                                {row.inputQuantity}
                              </span>
                            </td>

                            {/* Ironed Quantity (ADMIN ENTERS) */}
                            <td className="py-3 px-4 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={row.inputQuantity}
                                disabled={isLocked || isIroningDone}
                                value={
                                  liveIronedInputs[row.rowKey] !== undefined
                                    ? liveIronedInputs[row.rowKey]
                                    : row.actualQuantity !== null
                                    ? String(row.actualQuantity)
                                    : ""
                                }
                                placeholder="Enter qty"
                                onChange={(e) => handleIronedChange(row.rowKey, e.target.value)}
                                className={`w-28 text-center mx-auto h-8 text-xs font-semibold ${
                                  row.status === "invalid"
                                    ? "border-rose-400 focus-visible:ring-rose-300"
                                    : row.status === "complete"
                                    ? "border-emerald-300 bg-emerald-50/30 text-emerald-900"
                                    : "border-slate-300"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-medium mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </td>

                            {/* Pending (AUTOMATIC READ-ONLY) */}
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs border ${
                                  row.pendingQuantity === 0
                                    ? "bg-evenvibe-light text-emerald-800 border-emerald-200"
                                    : row.pendingQuantity !== null
                                    ? "bg-amber-50 text-amber-900 border-amber-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {row.pendingQuantity !== null ? row.pendingQuantity : "—"}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-center">
                              {row.status === "complete" ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-2 py-0.5">
                                  Complete ✓
                                </Badge>
                              ) : row.status === "pending" ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] px-2 py-0.5">
                                  Pending
                                </Badge>
                              ) : row.status === "invalid" ? (
                                <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] px-2 py-0.5">
                                  Invalid
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 text-[10px] px-2 py-0.5">
                                  Enter Ironed
                                </Badge>
                              )}
                            </td>

                            {/* Remarks */}
                            <td className="py-3 px-4">
                              <Input
                                type="text"
                                disabled={isLocked || isIroningDone}
                                value={
                                  liveIroningRemarks[row.rowKey] !== undefined
                                    ? liveIroningRemarks[row.rowKey]
                                    : row.remarks || ""
                                }
                                placeholder="Optional remarks..."
                                onChange={(e) => handleIroningRemarksChange(row.rowKey, e.target.value)}
                                className="h-8 text-xs max-w-sm"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Operational Ironing Table: Mobile Cards View */}
                  <div className="md:hidden space-y-3 p-4 bg-slate-50/50">
                    {grp.sizeRows.map((row) => (
                      <MobileCard
                        key={`mob-iron-${row.rowKey}`}
                        className={`border ${
                          row.status === "invalid"
                            ? "border-rose-300 bg-rose-50/20"
                            : row.status === "complete"
                            ? "border-emerald-200 bg-white"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="font-bold text-sm text-slate-900">Size: {row.size}</span>
                          {row.status === "complete" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-2 py-0.5">
                              Complete ✓
                            </Badge>
                          ) : row.status === "pending" ? (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] px-2 py-0.5">
                              Pending
                            </Badge>
                          ) : row.status === "invalid" ? (
                            <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] px-2 py-0.5">
                              Invalid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 text-[10px] px-2 py-0.5">
                              Enter Ironed
                            </Badge>
                          )}
                        </div>

                        <MobileCardField
                          label="Input from Checking"
                          value={
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs">
                              <Lock className="h-3 w-3 text-slate-400" />
                              {row.inputQuantity} pieces
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Ironed Quantity (Admin Input)"
                          value={
                            <div className="w-full pt-0.5">
                              <Input
                                type="number"
                                min={0}
                                max={row.inputQuantity}
                                disabled={isLocked || isIroningDone}
                                value={
                                  liveIronedInputs[row.rowKey] !== undefined
                                    ? liveIronedInputs[row.rowKey]
                                    : row.actualQuantity !== null
                                    ? String(row.actualQuantity)
                                    : ""
                                }
                                placeholder="Enter qty"
                                onChange={(e) => handleIronedChange(row.rowKey, e.target.value)}
                                className={`w-full h-9 text-xs font-semibold ${
                                  row.status === "invalid"
                                    ? "border-rose-400 focus-visible:ring-rose-300"
                                    : row.status === "complete"
                                    ? "border-emerald-300 bg-emerald-50/30 text-emerald-900"
                                    : "border-slate-300"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-medium mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </div>
                          }
                        />

                        <MobileCardField
                          label="Pending (Calculated)"
                          value={
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md font-bold text-xs border ${
                                row.pendingQuantity === 0
                                  ? "bg-evenvibe-light text-emerald-800 border-emerald-200"
                                  : row.pendingQuantity !== null
                                  ? "bg-amber-50 text-amber-900 border-amber-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {row.pendingQuantity !== null ? `${row.pendingQuantity} pieces` : "—"}
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Remarks (Optional)"
                          value={
                            <Input
                              type="text"
                              disabled={isLocked || isIroningDone}
                              value={
                                liveIroningRemarks[row.rowKey] !== undefined
                                  ? liveIroningRemarks[row.rowKey]
                                  : row.remarks || ""
                              }
                              placeholder="Optional remarks..."
                              onChange={(e) => handleIroningRemarksChange(row.rowKey, e.target.value)}
                              className="h-9 text-xs w-full"
                            />
                          }
                        />
                      </MobileCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Action buttons for Ironing */}
              {!isIroningDone && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    💡 Zero (0) is a valid entered quantity. Ironing can only be completed when every size row has Ironed Quantity = Input Quantity (Pending = 0).
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveIroning}
                      disabled={isSavingIroning || isLocked}
                      className="gap-1.5 text-xs font-semibold w-full sm:w-auto"
                    >
                      <Save className="h-3.5 w-3.5 text-slate-600" />
                      {isSavingIroning ? "Saving..." : "Save Ironing Progress"}
                    </Button>

                    <Button
                      size="sm"
                      onClick={handleCompleteIroning}
                      disabled={!ironingResult.canComplete || isCompletingIroning || isLocked}
                      className="bg-status-warning hover:bg-amber-700 text-white gap-1.5 text-xs font-semibold shadow-xs w-full sm:w-auto"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {isCompletingIroning ? "Completing..." : "Complete Ironing → Unlock Packing"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. SECTION 2: PACKING OPERATION */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-evenvibe-light/50 border-b border-evenvibe-light pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-evenvibe-deep uppercase tracking-wide">
                <PackageCheck className="h-4 w-4 text-evenvibe-primary" />
                Step 2: Folding, Bagging & Packing
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Input is read-only (Ironed Output). Admin enters <strong>Packed Quantity</strong>. Completion marks order status as <strong>Packed</strong>.
              </p>
            </div>
            {isStage8Completed ? (
              <Badge className="bg-evenvibe-primary text-white font-bold text-xs px-2.5 py-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Packed & Finished ✓
              </Badge>
            ) : isIroningDone ? (
              <Badge className="bg-evenvibe-primary text-white font-semibold text-xs px-2.5 py-0.5">
                Packing Active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-300 text-slate-400 text-xs px-2 py-0.5 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Locked State: Packing remains locked until Ironing completes */}
          {!isIroningDone ? (
            <div className="p-8 text-center border-2 border-dashed border-evenvibe-light rounded-xl bg-evenvibe-light/30 space-y-2">
              <div className="h-10 w-10 rounded-full bg-evenvibe-light flex items-center justify-center mx-auto text-evenvibe-deep">
                <Lock className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-evenvibe-deep">
                Packing is locked until Ironing is 100% completed
              </h4>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                All garments must be fully ironed and validated before packing can begin. Complete Step 1 above to unlock this section.
              </p>
            </div>
          ) : !packingResult.hasOperationalPieces ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60">
              <AlertCircle className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">
                {packingResult.emptyStateMessage || "No pieces are available for packing."}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Ironing produced 0 output pieces for packing.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Packing Metrics 4-Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Total Input (Ironed)
                  </span>
                  <span className="text-2xl font-black text-slate-900 mt-1 block">
                    {packingResult.totalInputPieces}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Physical pieces from Ironing
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-evenvibe-light bg-evenvibe-light/60 shadow-2xs">
                  <span className="text-[11px] font-semibold text-evenvibe-deep uppercase tracking-wide block">
                    Packed Pieces
                  </span>
                  <span className="text-2xl font-black text-evenvibe-deep mt-1 block">
                    {packingResult.totalPackedPieces}
                  </span>
                  <span className="text-[10px] text-evenvibe-deep block mt-0.5">
                    Admin entered quantity
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/60 shadow-2xs">
                  <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wide block">
                    Pending Pieces
                  </span>
                  <span className="text-2xl font-black text-rose-900 mt-1 block">
                    {packingResult.totalPendingPieces}
                  </span>
                  <span className="text-[10px] text-rose-700 block mt-0.5">
                    Input − Packed Quantity
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Packing Progress
                  </span>
                  <span className="text-2xl font-black text-slate-900 mt-1 block">
                    {packingResult.totalCompletedSizesCount} / {packingResult.totalRequiredSizesCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {packingResult.allSizesComplete ? "100% Ready to Pack" : "Sizes Incomplete"}
                  </span>
                </div>
              </div>

              {/* Operational Packing Groups */}
              {packingResult.groups.map((grp) => (
                <div
                  key={grp.groupKey}
                  className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs bg-white"
                >
                  {/* Group Header */}
                  <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{grp.itemName}</span>
                      <span className="text-xs text-slate-500">—</span>
                      <span className="text-xs font-semibold text-slate-700">
                        Style: {grp.styleName || "Standard"}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600">
                        Color: <strong className="text-slate-800">{grp.color || "Standard"}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">
                        Input: <strong className="text-slate-900">{grp.totalInput}</strong>
                      </span>
                      <span className="text-evenvibe-deep">
                        Packed: <strong>{grp.totalActual}</strong>
                      </span>
                      <span className="text-rose-800">
                        Pending: <strong>{grp.totalPending}</strong>
                      </span>
                      {grp.isGroupComplete ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] px-1.5 py-0">
                          Complete ✓
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-evenvibe-deep -evenvibe-primary text-[10px] px-1.5 py-0">
                          Incomplete
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Operational Packing Table: Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/40 text-slate-600 border-b border-slate-200">
                          <th className="py-2.5 px-4 font-semibold w-24">Size</th>
                          <th className="py-2.5 px-4 font-semibold w-36 text-center">
                            Input from Ironing 🔒
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-40 text-center">
                            Packed Quantity ✏️
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-32 text-center">
                            Pending 🔒
                          </th>
                          <th className="py-2.5 px-4 font-semibold w-32 text-center">Status</th>
                          <th className="py-2.5 px-4 font-semibold">Remarks (Optional)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grp.sizeRows.map((row) => (
                          <tr
                            key={row.rowKey}
                            className={`hover:bg-slate-50/50 transition-colors ${
                              row.status === "invalid" ? "bg-rose-50/40" : ""
                            }`}
                          >
                            {/* Size */}
                            <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                              {row.size}
                            </td>

                            {/* Input from Ironing (READ ONLY) */}
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs">
                                <Lock className="h-3 w-3 text-slate-400" />
                                {row.inputQuantity}
                              </span>
                            </td>

                            {/* Packed Quantity (ADMIN ENTERS) */}
                            <td className="py-3 px-4 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={row.inputQuantity}
                                disabled={isLocked || isStage8Completed}
                                value={
                                  livePackedInputs[row.rowKey] !== undefined
                                    ? livePackedInputs[row.rowKey]
                                    : row.actualQuantity !== null
                                    ? String(row.actualQuantity)
                                    : ""
                                }
                                placeholder="Enter qty"
                                onChange={(e) => handlePackedChange(row.rowKey, e.target.value)}
                                className={`w-28 text-center mx-auto h-8 text-xs font-semibold ${
                                  row.status === "invalid"
                                    ? "border-rose-400 focus-visible:ring-rose-300"
                                    : row.status === "complete"
                                    ? "border-emerald-300 bg-emerald-50/30 text-emerald-900"
                                    : "border-slate-300"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-medium mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </td>

                            {/* Pending (AUTOMATIC READ-ONLY) */}
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs border ${
                                  row.pendingQuantity === 0
                                    ? "bg-evenvibe-light text-emerald-800 border-emerald-200"
                                    : row.pendingQuantity !== null
                                    ? "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {row.pendingQuantity !== null ? row.pendingQuantity : "—"}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-center">
                              {row.status === "complete" ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-2 py-0.5">
                                  Complete ✓
                                </Badge>
                              ) : row.status === "pending" ? (
                                <Badge className="bg-evenvibe-light text-evenvibe-deep -evenvibe-primary text-[10px] px-2 py-0.5">
                                  Pending
                                </Badge>
                              ) : row.status === "invalid" ? (
                                <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] px-2 py-0.5">
                                  Invalid
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 text-[10px] px-2 py-0.5">
                                  Enter Packed
                                </Badge>
                              )}
                            </td>

                            {/* Remarks */}
                            <td className="py-3 px-4">
                              <Input
                                type="text"
                                disabled={isLocked || isStage8Completed}
                                value={
                                  livePackingRemarks[row.rowKey] !== undefined
                                    ? livePackingRemarks[row.rowKey]
                                    : row.remarks || ""
                                }
                                placeholder="Optional remarks..."
                                onChange={(e) => handlePackingRemarksChange(row.rowKey, e.target.value)}
                                className="h-8 text-xs max-w-sm"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Operational Packing Table: Mobile Cards View */}
                  <div className="md:hidden space-y-3 p-4 bg-slate-50/50">
                    {grp.sizeRows.map((row) => (
                      <MobileCard
                        key={`mob-pack-${row.rowKey}`}
                        className={`border ${
                          row.status === "invalid"
                            ? "border-rose-300 bg-rose-50/20"
                            : row.status === "complete"
                            ? "border-emerald-200 bg-white"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="font-bold text-sm text-slate-900">Size: {row.size}</span>
                          {row.status === "complete" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-2 py-0.5">
                              Complete ✓
                            </Badge>
                          ) : row.status === "pending" ? (
                            <Badge className="bg-evenvibe-light text-evenvibe-deep -evenvibe-primary text-[10px] px-2 py-0.5">
                              Pending
                            </Badge>
                          ) : row.status === "invalid" ? (
                            <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] px-2 py-0.5">
                              Invalid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 text-[10px] px-2 py-0.5">
                              Enter Packed
                            </Badge>
                          )}
                        </div>

                        <MobileCardField
                          label="Input from Ironing"
                          value={
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200 text-xs">
                              <Lock className="h-3 w-3 text-slate-400" />
                              {row.inputQuantity} pieces
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Packed Quantity (Admin Input)"
                          value={
                            <div className="w-full pt-0.5">
                              <Input
                                type="number"
                                min={0}
                                max={row.inputQuantity}
                                disabled={isLocked || isStage8Completed}
                                value={
                                  livePackedInputs[row.rowKey] !== undefined
                                    ? livePackedInputs[row.rowKey]
                                    : row.actualQuantity !== null
                                    ? String(row.actualQuantity)
                                    : ""
                                }
                                placeholder="Enter qty"
                                onChange={(e) => handlePackedChange(row.rowKey, e.target.value)}
                                className={`w-full h-9 text-xs font-semibold ${
                                  row.status === "invalid"
                                    ? "border-rose-400 focus-visible:ring-rose-300"
                                    : row.status === "complete"
                                    ? "border-emerald-300 bg-emerald-50/30 text-emerald-900"
                                    : "border-slate-300"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-medium mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </div>
                          }
                        />

                        <MobileCardField
                          label="Pending (Calculated)"
                          value={
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-md font-bold text-xs border ${
                                row.pendingQuantity === 0
                                  ? "bg-evenvibe-light text-emerald-800 border-emerald-200"
                                  : row.pendingQuantity !== null
                                  ? "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {row.pendingQuantity !== null ? `${row.pendingQuantity} pieces` : "—"}
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Remarks (Optional)"
                          value={
                            <Input
                              type="text"
                              disabled={isLocked || isStage8Completed}
                              value={
                                livePackingRemarks[row.rowKey] !== undefined
                                  ? livePackingRemarks[row.rowKey]
                                  : row.remarks || ""
                              }
                              placeholder="Optional remarks..."
                              onChange={(e) => handlePackingRemarksChange(row.rowKey, e.target.value)}
                              className="h-9 text-xs w-full"
                            />
                          }
                        />
                      </MobileCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Action buttons for Packing */}
              {!isStage8Completed ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    📦 Packing completes only when every size has Packed Quantity = Input Quantity (Pending = 0). Upon completion, Order Status automatically transitions to <strong>Packed</strong>.
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSavePacking}
                      disabled={isSavingPacking || isLocked}
                      className="gap-1.5 text-xs font-semibold w-full sm:w-auto"
                    >
                      <Save className="h-3.5 w-3.5 text-slate-600" />
                      {isSavingPacking ? "Saving..." : "Save Packing Progress"}
                    </Button>

                    <Button
                      size="sm"
                      onClick={handleCompletePacking}
                      disabled={!packingResult.canComplete || isCompletingPacking || isLocked}
                      className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-1.5 text-xs font-semibold shadow-xs w-full sm:w-auto"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isCompletingPacking ? "Finalizing..." : "Complete Packing → Set Order Status = Packed"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-emerald-300 bg-evenvibe-light flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-evenvibe-primary text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-950">
                        Manufacturing Production Completed Successfully!
                      </h4>
                      <p className="text-xs text-emerald-800">
                        Order #{orderNumber} has been completely packed ({packingResult.totalPackedPieces} total units). Order status is updated to <strong>Packed</strong> and ready for dispatch.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
