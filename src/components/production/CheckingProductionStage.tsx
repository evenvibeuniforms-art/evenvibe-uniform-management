"use client";

import React, { useState, useMemo } from "react";
import {
  CheckingCalculationResult,
  StoredCheckingItem,
  calculateCheckingStage,
  buildCheckingGroupKey,
  buildCheckingSizeRowKey,
} from "@/lib/production/checkingEngine";
import { StoredStageItem } from "@/lib/production/dynamicStageEngine";
import { OrderWorkflowStage, formatWorkflowStageLabel } from "@/lib/productionWorkflow";
import { saveOrderCheckingItemsAction, completeOrderCheckingAction } from "@/app/(admin)/admin/production/actions";
import { exportCheckingExcel } from "@/lib/production/exportCheckingExcel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  Save,
  CheckCircle2,
  Printer,
  Download,
  Search,
  AlertCircle,
  Layers,
  XCircle,
  ShieldCheck,
  Lock,
} from "lucide-react";

interface CheckingProductionStageProps {
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  workflows: OrderWorkflowStage[] | null | undefined;
  stageItems: StoredStageItem[];
  savedCheckingItems: StoredCheckingItem[];
  currentStage: string;
  isLocked?: boolean;
  onCheckingUpdated?: (updated: StoredCheckingItem[]) => void;
  onStageAdvanced?: () => void;
  onPrint?: () => void;
}

export default function CheckingProductionStage({
  orderId,
  orderNumber,
  schoolName = "",
  workflows,
  stageItems,
  savedCheckingItems: initialSavedItems = [],
  currentStage,
  isLocked = false,
  onCheckingUpdated,
  onStageAdvanced,
  onPrint,
}: CheckingProductionStageProps) {
  // Local input state: rowKey -> string value for smooth typing
  const initFromSaved = (items: StoredCheckingItem[]) => {
    const passed: Record<string, string> = {};
    const remarks: Record<string, string> = {};

    (items || []).forEach((ci) => {
      const gKey = buildCheckingGroupKey(ci.item_name, ci.style_id, ci.style_name, ci.color);
      const rKey = buildCheckingSizeRowKey(gKey, ci.size);

      if (ci.passed_quantity !== null && ci.passed_quantity !== undefined && !isNaN(ci.passed_quantity)) {
        passed[rKey] = String(ci.passed_quantity);
      }
      if (ci.remarks) {
        remarks[rKey] = ci.remarks;
      }
    });

    return { passed, remarks };
  };

  const initialInputs = useMemo(() => initFromSaved(initialSavedItems), [initialSavedItems]);

  const [passedInputs, setPassedInputs] = useState<Record<string, string>>(initialInputs.passed);
  const [remarksInputs, setRemarksInputs] = useState<Record<string, string>>(initialInputs.remarks);

  // Sync state if initialSavedItems changes
  const [prevSaved, setPrevSaved] = useState(initialSavedItems);
  if (initialSavedItems !== prevSaved) {
    setPrevSaved(initialSavedItems);
    const updated = initFromSaved(initialSavedItems);
    setPassedInputs(updated.passed);
    setRemarksInputs(updated.remarks);
  }

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemFilter, setSelectedItemFilter] = useState("ALL");
  const [selectedStyleFilter, setSelectedStyleFilter] = useState("ALL");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");

  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Authoritative live calculation result
  const calculationResult: CheckingCalculationResult = useMemo(() => {
    return calculateCheckingStage({
      workflows,
      stageItems,
      savedCheckingItems: initialSavedItems,
      liveInputs: {
        passedInputs,
        remarksInputs,
      },
    });
  }, [workflows, stageItems, initialSavedItems, passedInputs, remarksInputs]);

  const {
    finalDynamicStageDisplayName,
    groups,
    totalInputPieces,
    totalPassedPieces,
    totalRejectPieces,
    totalRequiredSizesCount,
    totalCompletedSizesCount,
    missingSizesCount,
    allSizesComplete,
    canComplete,
    completionErrorMessage,
  } = calculationResult;

  // Filter dropdown options
  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => set.add(g.itemName));
    return Array.from(set).sort();
  }, [groups]);

  const styleOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => set.add(g.cleanStyleName));
    return Array.from(set).sort();
  }, [groups]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => set.add(g.displayColor));
    return Array.from(set).sort();
  }, [groups]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (selectedItemFilter !== "ALL" && g.itemName !== selectedItemFilter) return false;
      if (selectedStyleFilter !== "ALL" && g.cleanStyleName !== selectedStyleFilter) return false;
      if (selectedColorFilter !== "ALL" && g.displayColor !== selectedColorFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = g.displayName.toLowerCase().includes(q);
        const matchesSizes = g.sizeRows.some((r) => r.size.toLowerCase().includes(q));
        if (!matchesName && !matchesSizes) return false;
      }

      return true;
    });
  }, [groups, selectedItemFilter, selectedStyleFilter, selectedColorFilter, searchQuery]);

  const checkingWorkflow = (workflows || []).find((w) => w.stage_key === "checking");
  const isStageCompleted = checkingWorkflow?.status === "completed";
  const isCurrentActiveStage = currentStage === "checking" || checkingWorkflow?.status === "in_progress";
  const isStageReadOnly = Boolean(isLocked || isStageCompleted || !isCurrentActiveStage);

  // Input change handlers
  const handlePassedChange = (rowKey: string, value: string) => {
    if (isStageReadOnly) return;
    const clean = value.replace(/[^\d]/g, "");
    setPassedInputs((prev) => ({
      ...prev,
      [rowKey]: clean,
    }));
  };

  const handleRemarksChange = (rowKey: string, value: string) => {
    if (isStageReadOnly) return;
    setRemarksInputs((prev) => ({
      ...prev,
      [rowKey]: value,
    }));
  };

  // Helper: Collect items currently filled for saving
  const collectItemsForSave = () => {
    const items: {
      item_name: string;
      style_id?: string | null;
      style_name?: string | null;
      color?: string | null;
      size: string;
      input_quantity: number;
      passed_quantity: number;
      remarks?: string | null;
    }[] = [];

    for (const g of groups) {
      for (const r of g.sizeRows) {
        const pVal = passedInputs[r.rowKey];
        const hasP = pVal !== undefined && pVal !== "" && /^\d+$/.test(pVal);

        if (hasP) {
          const passed = parseInt(pVal, 10);

          if (passed > r.inputQuantity) {
            throw new Error(
              `Passed quantity cannot be greater than input quantity for ${g.itemName} (${r.size}).`
            );
          }

          items.push({
            item_name: g.itemName,
            style_id: g.styleId,
            style_name: g.styleName,
            color: g.color,
            size: r.size,
            input_quantity: r.inputQuantity,
            passed_quantity: passed,
            remarks: remarksInputs[r.rowKey] || null,
          });
        }
      }
    }

    return items;
  };

  // Save Progress Handler
  const handleSaveProgress = async () => {
    try {
      setIsSaving(true);
      const itemsToSave = collectItemsForSave();

      if (itemsToSave.length === 0) {
        toast.info("No checking quantities entered to save.");
        setIsSaving(false);
        return;
      }

      const res = await saveOrderCheckingItemsAction(orderId, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Progress saved for Checking (${res.savedCount} items).`);
        if (onCheckingUpdated) {
          const updated: StoredCheckingItem[] = [
            ...(initialSavedItems || []).filter((ci) => !itemsToSave.some((it) => it.item_name === ci.item_name && it.size === ci.size)),
            ...itemsToSave.map((it) => ({
              order_id: orderId,
              item_name: it.item_name,
              style_id: it.style_id,
              style_name: it.style_name,
              color: it.color,
              size: it.size,
              input_quantity: it.input_quantity,
              passed_quantity: it.passed_quantity,
              rework_quantity: 0,
              reject_quantity: it.input_quantity - it.passed_quantity,
              remarks: it.remarks,
              status: "completed",
            })),
          ];
          onCheckingUpdated(updated);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save Checking data");
    } finally {
      setIsSaving(false);
    }
  };

  // Stage Completion Handler
  const handleCompleteChecking = async () => {
    if (!canComplete) {
      toast.error(
        completionErrorMessage ||
          "Enter passed quantity for all required sizes before completing Checking."
      );
      return;
    }

    try {
      setIsCompleting(true);

      // Collect all operational rows with explicit values
      const itemsToSave = groups.flatMap((g) =>
        g.sizeRows.map((r) => {
          const pVal = passedInputs[r.rowKey];
          const passed = pVal !== undefined && pVal !== "" ? parseInt(pVal, 10) : 0;
          return {
            item_name: g.itemName,
            style_id: g.styleId,
            style_name: g.styleName,
            color: g.color,
            size: r.size,
            input_quantity: r.inputQuantity,
            passed_quantity: passed,
            remarks: remarksInputs[r.rowKey] || null,
          };
        })
      );

      // 1. Ensure all rows are saved to DB
      const saveRes = await saveOrderCheckingItemsAction(orderId, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        setIsCompleting(false);
        return;
      }

      // 2. Invoke server completion gate
      const compRes = await completeOrderCheckingAction(
        orderId,
        `Checking stage completed. Total Passed: ${totalPassedPieces}, Total Reject: ${totalRejectPieces}. Advanced to Ironing & Packing.`
      );

      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success(
          `Checking completed! Next stage (${formatWorkflowStageLabel(compRes.nextStage || "ironing_packing")}) is now unlocked and In Progress.`
        );
        if (onCheckingUpdated) {
          const updated: StoredCheckingItem[] = itemsToSave.map((it) => ({
            order_id: orderId,
            item_name: it.item_name,
            style_id: it.style_id,
            style_name: it.style_name,
            color: it.color,
            size: it.size,
            input_quantity: it.input_quantity,
            passed_quantity: it.passed_quantity,
            rework_quantity: 0,
            reject_quantity: it.input_quantity - it.passed_quantity,
            remarks: it.remarks,
            status: "completed",
          }));
          onCheckingUpdated(updated);
        }
        if (onStageAdvanced) {
          onStageAdvanced();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete Checking stage");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportCheckingExcel({
        orderNumber,
        schoolName,
        calculationResult,
      });
      toast.success("Checking Excel report downloaded successfully.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export Excel report.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Executive Summary & Controls Card */}
      <Card className="border-evenvibe-light shadow-sm bg-gradient-to-r from-white via-indigo-50/20 to-white">
        <CardHeader className="pb-4 border-b border-evenvibe-light/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                STAGE 7 — QUALITY CHECKING
              </div>
              <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Quality Checking Operation
              </CardTitle>
              <CardDescription className="text-xs text-slate-600">
                Input source: <strong>{finalDynamicStageDisplayName} Actual Physical Output</strong>. Enter passed quantity.
                Reject quantity is automatically calculated (<code className="font-semibold text-slate-800">Reject = Input - Passed</code>).
              </CardDescription>
            </div>

            {/* Stage Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {onPrint && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrint}
                  className="h-9 gap-1.5 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs font-medium text-xs w-full sm:w-auto"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Report
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 gap-1.5 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs font-medium text-xs w-full sm:w-auto"
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
              {!isStageReadOnly && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveProgress}
                    disabled={isSaving || isCompleting}
                    className="h-9 gap-1.5 -evenvibe-primary bg-evenvibe-light/50 hover:bg-evenvibe-light text-evenvibe-deep font-medium text-xs w-full sm:w-auto"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? "Saving..." : "Save Progress"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCompleteChecking}
                    disabled={isCompleting || isSaving || !canComplete}
                    className={`h-9 gap-1.5 font-semibold text-xs shadow-sm transition-all w-full sm:w-auto ${
                      canComplete
                        ? "bg-evenvibe-primary hover:bg-evenvibe-deep text-white shadow-emerald-200"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed hover:bg-slate-200"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isCompleting ? "Completing..." : "Complete Checking → Unlock Ironing & Packing"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {/* Executive Metrics Grid: 4 Cards (Input, Passed, Reject, Progress) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center">
            {/* 1. Input */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Input Pieces
              </span>
              <p className="text-2xl font-black text-slate-900">{totalInputPieces}</p>
              <span className="text-[10px] text-slate-500 block truncate" title={finalDynamicStageDisplayName}>
                From {finalDynamicStageDisplayName}
              </span>
            </div>

            {/* 2. Passed */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-evenvibe-deep uppercase tracking-wider block flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-evenvibe-primary" />
                Passed Pieces
              </span>
              <p className="text-2xl font-black text-emerald-800">{totalPassedPieces}</p>
              <span className="text-[10px] text-evenvibe-primary font-medium block">
                Continues to Stage 8
              </span>
            </div>

            {/* 3. Reject */}
            <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block flex items-center justify-center gap-1">
                <XCircle className="h-3 w-3 text-status-error" />
                Rejected Pieces
              </span>
              <p className="text-2xl font-black text-rose-800">{totalRejectPieces}</p>
              <span className="text-[10px] text-status-error font-medium block">
                Automatically Calculated
              </span>
            </div>

            {/* 4. Completion Progress */}
            <div className="bg-white p-3.5 rounded-xl border border-evenvibe-light shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-evenvibe-deep uppercase tracking-wider block">
                Checking Progress
              </span>
              <p className="text-2xl font-black text-evenvibe-deep">
                {totalCompletedSizesCount} / {totalRequiredSizesCount}
              </p>
              <span
                className={`text-[10px] font-bold block ${
                  allSizesComplete ? "text-evenvibe-deep" : "text-amber-700"
                }`}
              >
                {allSizesComplete ? "Ready for Completion ✓" : `${missingSizesCount} Sizes Incomplete`}
              </span>
            </div>
          </div>

          {/* Validation Rule Explanation Banner */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start gap-2 text-xs text-blue-950">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Quality Verification Rule:</strong> Admin enters Passed Quantity. Reject Quantity is automatically derived (<code className="px-1 py-0.5 bg-white border border-blue-200 rounded font-semibold text-blue-900">Reject = Input - Passed</code>).
              Passed quantity must satisfy <code className="px-1 py-0.5 bg-white border border-blue-200 rounded font-semibold text-blue-900">0 ≤ Passed ≤ Input</code>.
              Zero (0) is a valid entered quantity. Only Passed pieces continue to Ironing & Packing.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 2. Filters & Search Bar */}
      <Card className="border-slate-200 shadow-2xs bg-white">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search item, style, or size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Item Filter */}
            <div>
              <select
                suppressHydrationWarning
                value={selectedItemFilter}
                onChange={(e) => setSelectedItemFilter(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-slate-300 bg-white px-3 py-1 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
              >
                <option value="ALL">All Items ({itemOptions.length})</option>
                {itemOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Style Filter */}
            <div>
              <select
                suppressHydrationWarning
                value={selectedStyleFilter}
                onChange={(e) => setSelectedStyleFilter(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-slate-300 bg-white px-3 py-1 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
              >
                <option value="ALL">All Styles ({styleOptions.length})</option>
                {styleOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Filter */}
            <div>
              <select
                suppressHydrationWarning
                value={selectedColorFilter}
                onChange={(e) => setSelectedColorFilter(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-slate-300 bg-white px-3 py-1 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
              >
                <option value="ALL">All Colors ({colorOptions.length})</option>
                {colorOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Grouped Production Tables */}
      {groups.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-300 bg-slate-50/50">
          <CardContent className="py-12 text-center space-y-2">
            <Layers className="h-10 w-10 text-slate-400 mx-auto" />
            <h4 className="text-base font-bold text-slate-800">
              No pieces are available for checking.
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Either previous production stages have not completed, or the final dynamic stage ({finalDynamicStageDisplayName}) produced 0 physical output across all sizes.
            </p>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="py-8 text-center space-y-2">
            <Search className="h-8 w-8 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-600 font-medium">
              No matching checking items found for the current search and filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <Card key={group.groupKey} className="border-slate-200 shadow-sm overflow-hidden bg-white">
              {/* Group Header */}
              <CardHeader className="bg-slate-50/80 border-b py-3 px-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{group.itemName}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-semibold text-slate-700">Style: {group.cleanStyleName}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-semibold text-slate-700">Color: {group.displayColor}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">
                      Input: <strong>{group.inputTotal}</strong>
                    </span>
                    <span className="text-evenvibe-deep">
                      Passed: <strong>{group.passedTotal ?? "—"}</strong>
                    </span>
                    <span className="text-rose-700">
                      Reject: <strong>{group.rejectTotal ?? "—"}</strong>
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold px-2 py-0.5 ${
                        group.allSizesComplete
                          ? "bg-evenvibe-light text-evenvibe-deep border-emerald-300"
                          : "bg-amber-50 text-amber-700 border-amber-300"
                      }`}
                    >
                      {group.statusText}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              {/* Group Table: Desktop View */}
              <CardContent className="p-0">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/60 border-b text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        <th className="py-2.5 px-4 w-20">Size</th>
                        <th className="py-2.5 px-3 text-right w-44">
                          Input From {finalDynamicStageDisplayName}
                        </th>
                        <th className="py-2.5 px-3 text-center w-36">
                          Passed Quantity
                        </th>
                        <th className="py-2.5 px-3 text-center w-36">
                          Reject Quantity
                        </th>
                        <th className="py-2.5 px-3 text-center w-32">
                          Status
                        </th>
                        <th className="py-2.5 px-4 min-w-[200px]">
                          Checking Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.sizeRows.map((row) => {
                        const isComplete = row.isComplete;
                        const isInvalid = row.status === "invalid";

                        return (
                          <tr
                            key={row.size}
                            className={`transition-colors hover:bg-slate-50/60 ${
                              isComplete
                                ? "bg-emerald-50/20"
                                : isInvalid
                                ? "bg-rose-50/20"
                                : ""
                            }`}
                          >
                            {/* Size */}
                            <td className="py-3 px-4 font-bold text-slate-900">{row.size}</td>

                            {/* 1. Read-Only Input */}
                            <td className="py-3 px-3 text-right font-black text-slate-900">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-800 font-mono text-xs">
                                <Lock className="h-3 w-3 text-slate-400" />
                                {row.inputQuantity}
                              </span>
                            </td>

                            {/* 2. Passed Quantity (Editable by Admin) */}
                            <td className="py-3 px-3 text-center">
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                disabled={isStageReadOnly}
                                value={passedInputs[row.rowKey] ?? ""}
                                onChange={(e) => handlePassedChange(row.rowKey, e.target.value)}
                                className={`h-8 w-24 mx-auto text-center font-bold text-xs border ${
                                  row.passedQuantity !== null
                                    ? isInvalid
                                      ? "border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-status-error"
                                      : "border-emerald-400 bg-emerald-50/40 text-emerald-900 focus:ring-emerald-500"
                                    : "border-slate-300 text-slate-800"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-semibold mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </td>

                            {/* 3. Reject Quantity (AUTOMATIC READ-ONLY, NO INPUT CONTROL) */}
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex items-center justify-center min-w-16 px-2.5 py-1 rounded border font-mono font-bold text-xs ${
                                  row.rejectQuantity !== null
                                    ? row.rejectQuantity > 0
                                      ? "bg-rose-50 border-rose-300 text-rose-800"
                                      : "bg-slate-100 border-slate-200 text-slate-700"
                                    : "bg-slate-50 border-slate-200 text-slate-400"
                                }`}
                              >
                                {row.rejectQuantity !== null ? row.rejectQuantity : "—"}
                              </span>
                            </td>

                            {/* 4. Status Badge */}
                            <td className="py-3 px-3 text-center">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-bold px-2.5 py-0.5 ${
                                  isComplete
                                    ? "bg-evenvibe-light text-emerald-800 border-emerald-300"
                                    : isInvalid
                                    ? "bg-rose-50 text-rose-800 border-rose-300"
                                    : "bg-amber-50 text-amber-800 border-amber-300"
                                }`}
                              >
                                {row.statusText}
                              </Badge>
                            </td>

                            {/* 5. Remarks */}
                            <td className="py-3 px-4">
                              <Input
                                type="text"
                                placeholder="Optional remarks..."
                                disabled={isStageReadOnly}
                                value={remarksInputs[row.rowKey] ?? ""}
                                onChange={(e) => handleRemarksChange(row.rowKey, e.target.value)}
                                className="h-8 text-xs border-slate-200"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Group Table: Mobile Cards View */}
                <div className="md:hidden space-y-3 p-4 bg-slate-50/50">
                  {group.sizeRows.map((row) => {
                    const isComplete = row.isComplete;
                    const isInvalid = row.status === "invalid";

                    return (
                      <MobileCard
                        key={`mob-${row.size}`}
                        className={`border ${
                          isComplete
                            ? "border-emerald-200 bg-white"
                            : isInvalid
                            ? "border-rose-300 bg-rose-50/20"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="font-bold text-sm text-slate-900">Size: {row.size}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold px-2.5 py-0.5 ${
                              isComplete
                                ? "bg-evenvibe-light text-emerald-800 border-emerald-300"
                                : isInvalid
                                ? "bg-rose-50 text-rose-800 border-rose-300"
                                : "bg-amber-50 text-amber-800 border-amber-300"
                            }`}
                          >
                            {row.statusText}
                          </Badge>
                        </div>

                        <MobileCardField
                          label={`Input from ${finalDynamicStageDisplayName}`}
                          value={
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-800 font-mono text-xs font-bold">
                              <Lock className="h-3 w-3 text-slate-400" />
                              {row.inputQuantity} pieces
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Passed Quantity (Admin Entered)"
                          value={
                            <div className="w-full pt-0.5">
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                disabled={isStageReadOnly}
                                value={passedInputs[row.rowKey] ?? ""}
                                onChange={(e) => handlePassedChange(row.rowKey, e.target.value)}
                                className={`h-9 w-full font-bold text-xs border ${
                                  row.passedQuantity !== null
                                    ? isInvalid
                                      ? "border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-status-error"
                                      : "border-emerald-400 bg-emerald-50/40 text-emerald-900 focus:ring-emerald-500"
                                    : "border-slate-300 text-slate-800"
                                }`}
                              />
                              {row.errorMessage && (
                                <p className="text-[10px] text-status-error font-semibold mt-1">
                                  {row.errorMessage}
                                </p>
                              )}
                            </div>
                          }
                        />

                        <MobileCardField
                          label="Reject Quantity (Calculated)"
                          value={
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded border font-mono font-bold text-xs ${
                                row.rejectQuantity !== null
                                  ? row.rejectQuantity > 0
                                    ? "bg-rose-50 border-rose-300 text-rose-800"
                                    : "bg-slate-100 border-slate-200 text-slate-700"
                                  : "bg-slate-50 border-slate-200 text-slate-400"
                              }`}
                            >
                              {row.rejectQuantity !== null ? `${row.rejectQuantity} pieces` : "—"}
                            </span>
                          }
                        />

                        <MobileCardField
                          label="Checking Remarks"
                          value={
                            <Input
                              type="text"
                              placeholder="Optional remarks..."
                              disabled={isStageReadOnly}
                              value={remarksInputs[row.rowKey] ?? ""}
                              onChange={(e) => handleRemarksChange(row.rowKey, e.target.value)}
                              className="h-9 text-xs border-slate-200 w-full"
                            />
                          }
                        />
                      </MobileCard>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
