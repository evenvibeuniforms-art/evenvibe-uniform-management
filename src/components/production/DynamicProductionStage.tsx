"use client";

import React, { useState, useMemo } from "react";
import {
  DynamicStageCalculationResult,
  StoredStageItem,
  calculateDynamicStage,
  canCompleteStage,
  getAdminMistakedLabel,
  getInputFromLabel,
  getResultLabel,
  buildDynamicGroupKey,
  buildDynamicSizeRowKey,
} from "@/lib/production/dynamicStageEngine";
import { StoredCuttingItem } from "@/lib/production/cuttingCalculations";
import { OrderWorkflowStage, formatWorkflowStageLabel } from "@/lib/productionWorkflow";
import { saveOrderStageItemsAction, completeOrderStageAction } from "@/app/(admin)/admin/production/actions";
import { exportDynamicStageExcel } from "@/lib/production/exportDynamicStageExcel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  Save,
  CheckCircle2,
  ArrowRight,
  Printer,
  Download,
  Search,
  AlertCircle,
  Layers,
} from "lucide-react";

interface DynamicProductionStageProps {
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  stageKey: string;
  workflows: OrderWorkflowStage[] | null | undefined;
  cuttingItems: StoredCuttingItem[];
  savedStageItems: StoredStageItem[];
  currentStage: string;
  isLocked?: boolean;
  onStageUpdated?: (updated: StoredStageItem[]) => void;
  onStageAdvanced?: () => void;
  onPrint?: () => void;
}

export default function DynamicProductionStage({
  orderId,
  orderNumber,
  schoolName = "",
  stageKey,
  workflows,
  cuttingItems,
  savedStageItems: initialSavedStageItems,
  currentStage,
  isLocked = false,
  onStageUpdated,
  onStageAdvanced,
  onPrint,
}: DynamicProductionStageProps) {
  // Local input state: rowKey -> string value for smooth typing
  const [actualInputs, setActualInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    (initialSavedStageItems || [])
      .filter((si) => si.stage_key === stageKey)
      .forEach((item) => {
        const rawActual = item.actual_quantity;
        const actualNum = typeof rawActual === "number"
          ? rawActual
          : (rawActual !== null && rawActual !== undefined && (rawActual as unknown) !== "")
            ? Number(rawActual)
            : null;
        if (actualNum !== null && !isNaN(actualNum) && actualNum >= 0) {
          const gKey = buildDynamicGroupKey(
            item.item_name,
            item.style_id,
            item.style_name,
            item.color
          );
          const rKey = buildDynamicSizeRowKey(gKey, item.size);
          init[rKey] = String(actualNum);
        }
      });
    return init;
  });

  // Re-sync inputs when orderId, stageKey, or saved items change
  const [prevSyncKey, setPrevSyncKey] = useState(`${orderId}::${stageKey}`);
  const [prevSaved, setPrevSaved] = useState(initialSavedStageItems);

  if (`${orderId}::${stageKey}` !== prevSyncKey || initialSavedStageItems !== prevSaved) {
    setPrevSyncKey(`${orderId}::${stageKey}`);
    setPrevSaved(initialSavedStageItems);
    const updated: Record<string, string> = {};
    (initialSavedStageItems || [])
      .filter((si) => si.stage_key === stageKey)
      .forEach((item) => {
        const rawActual = item.actual_quantity;
        const actualNum = typeof rawActual === "number"
          ? rawActual
          : (rawActual !== null && rawActual !== undefined && (rawActual as unknown) !== "")
            ? Number(rawActual)
            : null;
        if (actualNum !== null && !isNaN(actualNum) && actualNum >= 0) {
          const gKey = buildDynamicGroupKey(
            item.item_name,
            item.style_id,
            item.style_name,
            item.color
          );
          const rKey = buildDynamicSizeRowKey(gKey, item.size);
          updated[rKey] = String(actualNum);
        }
      });
    setActualInputs(updated);
  }

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemFilter, setSelectedItemFilter] = useState("ALL");
  const [selectedStyleFilter, setSelectedStyleFilter] = useState("ALL");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");

  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Authoritative live calculation result
  const calculationResult: DynamicStageCalculationResult = useMemo(() => {
    return calculateDynamicStage({
      stageKey,
      workflows,
      cuttingItems,
      stageItems: initialSavedStageItems,
      liveInputs: actualInputs,
    });
  }, [stageKey, workflows, cuttingItems, initialSavedStageItems, actualInputs]);

  const {
    stageDisplayName,
    previousStageDisplayName,
    nextStageDisplayName,
    groups,
    totalInputPieces,
    totalMistakedPieces,
    totalOutputPieces,
    totalRequiredSizesCount,
    totalEnteredSizesCount,
    allRequiredSizesEntered,
    missingSizesCount,
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

  const stageWorkflow = (workflows || []).find((w) => w.stage_key === stageKey);
  const isStageCompleted = stageWorkflow?.status === "completed";
  const isCurrentActiveStage = currentStage === stageKey || stageWorkflow?.status === "in_progress";
  const isStageReadOnly = Boolean(isLocked || isStageCompleted || !isCurrentActiveStage);

  // Input change handler
  const handleInputChange = (rowKey: string, value: string) => {
    if (isStageReadOnly) return;
    const clean = value.replace(/[^\d]/g, "");
    setActualInputs((prev) => ({
      ...prev,
      [rowKey]: clean,
    }));
  };

  // Save Progress
  const handleSaveProgress = async () => {
    try {
      setIsSaving(true);
      const itemsToSave: {
        item_name: string;
        style_id?: string | null;
        style_name?: string | null;
        color?: string | null;
        size: string;
        input_quantity: number;
        actual_quantity: number;
      }[] = [];

      for (const g of groups) {
        for (const r of g.sizeRows) {
          const val = actualInputs[r.rowKey];
          if (val !== undefined && val !== "" && /^\d+$/.test(val)) {
            const actualNum = parseInt(val, 10);
            if (actualNum > r.inputQuantity) {
              toast.error(
                `Mistaked quantity (${actualNum}) cannot exceed input quantity (${r.inputQuantity}) for ${g.itemName} (${r.size}).`
              );
              setIsSaving(false);
              return;
            }
            itemsToSave.push({
              item_name: g.itemName,
              style_id: g.styleId,
              style_name: g.styleName,
              color: g.color,
              size: r.size,
              input_quantity: r.inputQuantity,
              actual_quantity: actualNum,
            });
          }
        }
      }

      if (itemsToSave.length === 0) {
        toast.info("No quantities entered to save.");
        setIsSaving(false);
        return;
      }

      const res = await saveOrderStageItemsAction(orderId, stageKey, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Progress saved for ${stageDisplayName} (${res.savedCount} items).`);
        if (onStageUpdated) {
          const updatedStageItems: StoredStageItem[] = [
            ...(initialSavedStageItems || []).filter((si) => si.stage_key !== stageKey),
            ...itemsToSave.map((it) => ({
              order_id: orderId,
              stage_key: stageKey,
              sequence_order: calculationResult.stageSequence,
              item_name: it.item_name,
              style_id: it.style_id,
              style_name: it.style_name,
              color: it.color,
              size: it.size,
              input_quantity: it.input_quantity,
              actual_quantity: it.actual_quantity,
              result_quantity: it.input_quantity - it.actual_quantity,
              status: "completed",
            })),
          ];
          onStageUpdated(updatedStageItems);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to save ${stageDisplayName} data`);
    } finally {
      setIsSaving(false);
    }
  };

  // Stage Completion Handler
  const handleCompleteStage = async () => {
    // 1. Completion rule check: Every required size must have an actual mistaked quantity entered
    const completionCheck = canCompleteStage(calculationResult);
    if (!completionCheck.canComplete) {
      toast.error(completionCheck.errorMessage || "Enter actual quantity for all required sizes before completing this stage.");
      return;
    }

    try {
      setIsCompleting(true);

      // Collect all required size rows
      const itemsToSave: {
        item_name: string;
        style_id?: string | null;
        style_name?: string | null;
        color?: string | null;
        size: string;
        input_quantity: number;
        actual_quantity: number;
      }[] = [];

      for (const g of groups) {
        for (const r of g.sizeRows) {
          const val = actualInputs[r.rowKey];
          const isMissing = val === undefined || val === null || val.trim() === "";
          if (isMissing) {
            toast.error("Enter actual quantity for all required sizes before completing this stage.");
            setIsCompleting(false);
            return;
          }
          const actualNum = parseInt(val.trim(), 10);
          if (isNaN(actualNum) || actualNum < 0) {
            toast.error(`Invalid actual mistaked quantity for ${g.itemName} (${r.size}).`);
            setIsCompleting(false);
            return;
          }
          if (actualNum > r.inputQuantity) {
            toast.error(
              `Mistaked quantity (${actualNum}) cannot exceed input quantity (${r.inputQuantity}) for ${g.itemName} (${r.size}).`
            );
            setIsCompleting(false);
            return;
          }
          itemsToSave.push({
            item_name: g.itemName,
            style_id: g.styleId,
            style_name: g.styleName,
            color: g.color,
            size: r.size,
            input_quantity: r.inputQuantity,
            actual_quantity: actualNum,
          });
        }
      }

      // 2. Save items first
      const saveRes = await saveOrderStageItemsAction(orderId, stageKey, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        setIsCompleting(false);
        return;
      }

      // 3. Complete stage and advance next stage
      const note = `${stageDisplayName} stage completed: ${totalOutputPieces} output pieces (${totalMistakedPieces} mistaked) from ${totalInputPieces} input pieces.`;
      const compRes = await completeOrderStageAction(orderId, stageKey, note);

      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success(
          `${stageDisplayName} completed! Next stage (${formatWorkflowStageLabel(compRes.nextStage || "next")}) is now In Progress.`
        );
        if (onStageAdvanced) {
          onStageAdvanced();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to complete ${stageDisplayName} stage`);
    } finally {
      setIsCompleting(false);
    }
  };

  // Excel Export
  const handleExportExcel = async () => {
    try {
      await exportDynamicStageExcel({
        orderNumber,
        schoolName,
        calculationResult,
      });
      toast.success(`${stageDisplayName} Excel report exported successfully.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export Excel report");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Dynamic Stage Header & Sequence Info */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-white font-mono text-xs border-evenvibe-light text-evenvibe-deep"
                >
                  Stage #{calculationResult.stageSequence} of 8
                </Badge>
                <Badge
                  className={
                    isCurrentActiveStage
                      ? "bg-evenvibe-primary text-white font-medium text-xs"
                      : "bg-slate-200 text-slate-700 font-medium text-xs"
                  }
                >
                  {isCurrentActiveStage ? "Active Stage" : "Production Stage"}
                </Badge>
              </div>
              <CardTitle className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
                <Layers className="h-5 w-5 text-evenvibe-primary" />
                {stageDisplayName} Operation
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 mt-0.5">
                Dynamic middle stage configured for Order #{orderNumber}. Output flows directly into the next saved stage.
              </CardDescription>
            </div>

            {/* Sequence Stepper Pill */}
            <div className="flex flex-wrap items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs shadow-2xs self-start sm:self-auto">
              <span className="text-slate-500 font-medium">Previous:</span>
              <span className="font-bold text-slate-700">{previousStageDisplayName}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-black text-evenvibe-deep bg-evenvibe-light px-2 py-0.5 rounded border border-evenvibe-light">
                {stageDisplayName}
              </span>
              {nextStageDisplayName && (
                <>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-500 font-medium">Next:</span>
                  <span className="font-bold text-slate-700">{nextStageDisplayName}</span>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* 2. KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Input from {previousStageDisplayName}
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {totalInputPieces}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {totalInputPieces === 1 ? "piece" : "pieces"}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {previousStageDisplayName === "Cutting"
                  ? "Actual physical cut output"
                  : "Pieces received from previous stage"}
              </p>
            </div>

            <div className="bg-amber-50/60 p-3.5 rounded-lg border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
                Actual Mistaked {stageDisplayName}
              </span>
              <p className="text-2xl font-bold text-amber-900 mt-1">
                {totalMistakedPieces !== null ? totalMistakedPieces : "—"}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {totalEnteredSizesCount === 0
                  ? "No quantities entered"
                  : allRequiredSizesEntered
                  ? "Pieces lost / failed"
                  : `${totalEnteredSizesCount}/${totalRequiredSizesCount} sizes entered`}
              </p>
            </div>

            <div className="bg-evenvibe-light/60 p-3.5 rounded-lg border border-evenvibe-light">
              <span className="text-[11px] font-semibold text-evenvibe-deep uppercase tracking-wider block">
                Result / Output
              </span>
              <p className="text-2xl font-bold text-evenvibe-deep mt-1">
                {totalOutputPieces !== null ? totalOutputPieces : "—"}
              </p>
              <p className="text-[11px] text-evenvibe-deep mt-0.5">
                {totalEnteredSizesCount === 0
                  ? "Pending stage entries"
                  : allRequiredSizesEntered
                  ? "Continuing to next stage"
                  : `${totalEnteredSizesCount}/${totalRequiredSizesCount} sizes entered`}
              </p>
            </div>

            <div className="bg-emerald-50/60 p-3.5 rounded-lg border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                Stage Completion
              </span>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                {allRequiredSizesEntered ? `${totalRequiredSizesCount} Complete` : `${missingSizesCount} Pending`}
              </p>
              <p className="text-[11px] text-evenvibe-deep mt-0.5">
                {allRequiredSizesEntered ? "All sizes entered" : "Quantities required"}
              </p>
            </div>
          </div>

          {/* 3. Action Buttons & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filter by item, style, size..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9 bg-white"
                />
              </div>

              {itemOptions.length > 1 && (
                <select
                  suppressHydrationWarning
                  value={selectedItemFilter}
                  onChange={(e) => setSelectedItemFilter(e.target.value)}
                  className="text-xs h-9 px-2.5 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
                >
                  <option value="ALL">All Items ({itemOptions.length})</option>
                  {itemOptions.map((it) => (
                    <option key={it} value={it}>{it}</option>
                  ))}
                </select>
              )}

              {styleOptions.length > 1 && (
                <select
                  suppressHydrationWarning
                  value={selectedStyleFilter}
                  onChange={(e) => setSelectedStyleFilter(e.target.value)}
                  className="text-xs h-9 px-2.5 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
                >
                  <option value="ALL">All Styles ({styleOptions.length})</option>
                  {styleOptions.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              )}

              {colorOptions.length > 1 && (
                <select
                  suppressHydrationWarning
                  value={selectedColorFilter}
                  onChange={(e) => setSelectedColorFilter(e.target.value)}
                  className="text-xs h-9 px-2.5 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-evenvibe-primary"
                >
                  <option value="ALL">All Colors ({colorOptions.length})</option>
                  {colorOptions.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Stage Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="text-xs border-slate-300 hover:bg-slate-100 text-slate-700 gap-1.5 h-9 w-full sm:w-auto"
              >
                <Download className="h-3.5 w-3.5 text-evenvibe-primary" />
                Export Excel
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onPrint || (() => window.print())}
                className="text-xs border-slate-300 hover:bg-slate-100 text-slate-700 gap-1.5 h-9 w-full sm:w-auto"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" />
                Print
              </Button>

              {isCurrentActiveStage && !isLocked && !isStageCompleted && groups.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveProgress}
                    disabled={isSaving || isCompleting}
                    className="text-xs -evenvibe-primary text-evenvibe-deep hover:bg-evenvibe-light gap-1.5 h-9 font-medium w-full sm:w-auto"
                  >
                    <Save className="h-3.5 w-3.5 text-evenvibe-primary" />
                    {isSaving ? "Saving..." : "Save Progress"}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleCompleteStage}
                    disabled={isCompleting || isSaving}
                    className="text-xs bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-1.5 h-9 font-semibold shadow-xs w-full sm:w-auto"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isCompleting ? "Completing..." : `Complete ${stageDisplayName}`}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Missing items alert banner if required sizes not entered */}
          {isCurrentActiveStage && groups.length > 0 && !allRequiredSizesEntered && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 text-status-warning shrink-0" />
              <span>
                <strong>{missingSizesCount} required size(s)</strong> do not have an actual quantity entered. Every required size must have an actual mistaked quantity entered before completing {stageDisplayName}.
              </span>
            </div>
          )}

          {/* 4. Style + Color Separated Groups */}
          <div className="space-y-6">
            {groups.length === 0 ? (
              <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60 max-w-2xl mx-auto space-y-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <AlertCircle className="h-6 w-6 text-slate-500" />
                </div>
                <h4 className="text-base font-semibold text-slate-800">
                  No pieces are available from the previous stage.
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  The previous stage ({previousStageDisplayName}) produced 0 output pieces for this order.
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <p className="text-sm font-semibold text-slate-700">No items match your filter</p>
                <p className="text-xs text-slate-500 mt-1">Try resetting the search query or dropdown filters.</p>
              </div>
            ) : (
              filteredGroups.map((group) => {
                const prevStageInputLabel = getInputFromLabel(previousStageDisplayName);
                const currentStageMistakedLabel = getAdminMistakedLabel(stageDisplayName);
                const resultLabel = getResultLabel();

                return (
                  <Card key={group.groupKey} className="border-slate-200 shadow-2xs overflow-hidden">
                    {/* Group Header Banner */}
                    <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{group.itemName}</span>
                        <span className="text-slate-300">|</span>
                        <Badge variant="outline" className="bg-white text-slate-800 text-xs font-semibold">
                          Style: {group.cleanStyleName}
                        </Badge>
                        <Badge variant="outline" className="bg-white text-slate-700 text-xs font-semibold">
                          Color: {group.displayColor}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-600">
                          Total Input: <strong className="text-slate-900">{group.inputTotal} {group.inputTotal === 1 ? "piece" : "pieces"}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">
                          Total Mistaked: <strong className="text-amber-900">{group.mistakedTotal !== null ? group.mistakedTotal : "—"}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600">
                          Total Output: <strong className="text-evenvibe-deep">{group.outputTotal !== null ? group.outputTotal : "—"}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        {group.allSizesEntered ? (
                          <span className="text-evenvibe-deep font-semibold">✓ Complete</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">In Progress</span>
                        )}
                      </div>
                    </div>

                    {/* Desktop Three-Section Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          {/* Top Section Header Titles */}
                          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            <th className="py-2 px-3 border-r border-slate-200 bg-slate-50 w-24">
                              Size
                            </th>
                            <th className="py-2 px-3 border-r border-slate-200 bg-slate-100/70 text-slate-700">
                              <div className="flex items-center justify-between gap-1">
                                <span>SECTION 1: {prevStageInputLabel}</span>
                                {previousStageDisplayName === "Cutting" && (
                                  <Badge variant="outline" className="bg-white text-[9px] font-bold text-slate-700 border-slate-300 py-0 px-1">
                                    Actual Cut Output
                                  </Badge>
                                )}
                              </div>
                            </th>
                            <th className="py-2 px-3 border-r border-slate-200 bg-amber-50/50 text-amber-950 font-black">
                              SECTION 2: {currentStageMistakedLabel.toUpperCase()}
                            </th>
                            <th className="py-2 px-3 border-r border-slate-200 bg-evenvibe-light/50 text-evenvibe-deep font-black">
                              SECTION 3: {resultLabel}
                            </th>
                            <th className="py-2 px-3 bg-slate-50 text-slate-700 w-48">
                              Status
                            </th>
                          </tr>
                          {/* Column Descriptions */}
                          <tr className="border-b border-slate-200 bg-slate-50/50 text-[9px] text-slate-500 font-medium">
                            <th className="py-1 px-3 border-r border-slate-200">Standard Size</th>
                            <th className="py-1 px-3 border-r border-slate-200">
                              {previousStageDisplayName === "Cutting"
                                ? "Physical Cut Pieces (Actual Output)"
                                : "Input Pieces"}
                            </th>
                            <th className="py-1 px-3 border-r border-slate-200">Actual Mistaked Quantity</th>
                            <th className="py-1 px-3 border-r border-slate-200">Output (Input - Mistaked)</th>
                            <th className="py-1 px-3">Flow Status</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 bg-white">
                          {group.sizeRows.map((row) => {
                            const isRowEntered = row.mistakedQuantity !== null;
                            const isMistaked = row.statusType === "mistaked";

                            return (
                              <tr
                                key={row.rowKey}
                                className={`transition-colors ${
                                  !isRowEntered
                                    ? "bg-amber-50/20"
                                    : isMistaked
                                    ? "bg-amber-50/30"
                                    : "hover:bg-slate-50/50"
                                }`}
                              >
                                {/* Size */}
                                <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-200 bg-slate-50/40">
                                  {row.size}
                                </td>

                                {/* SECTION 1: Input from previous stage */}
                                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200 bg-slate-50/20">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-bold text-slate-900">{row.inputQuantity}</span>
                                    <span className="text-[10px] text-slate-500 font-normal">
                                      {row.inputQuantity === 1 ? "piece" : "pieces"}
                                    </span>
                                  </div>
                                </td>

                                {/* SECTION 2: Admin enters actual mistaked quantity */}
                                <td className="py-2 px-3 border-r border-slate-200">
                                  {isStageReadOnly ? (
                                    <span className="font-bold text-slate-900 px-2.5 py-1 bg-slate-100 rounded text-xs font-mono">
                                      {row.mistakedQuantity !== null ? row.mistakedQuantity : "—"}
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5 max-w-[130px]">
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        placeholder="—"
                                        value={actualInputs[row.rowKey] ?? ""}
                                        onChange={(e) => handleInputChange(row.rowKey, e.target.value)}
                                        className={`h-8 text-xs font-mono font-bold text-slate-900 bg-white ${
                                          !isRowEntered
                                            ? "border-amber-300 ring-1 ring-amber-200 focus:border-amber-400 focus:ring-amber-300"
                                            : "border-slate-300 focus:border-evenvibe-primary"
                                        }`}
                                      />
                                    </div>
                                  )}
                                </td>

                                {/* SECTION 3: Result / Output = input - mistaked */}
                                <td className="py-2 px-3 border-r border-slate-200 font-bold">
                                  {row.outputQuantity !== null ? (
                                    <span
                                      className={`inline-block font-mono text-xs px-2.5 py-0.5 rounded font-bold ${
                                        row.mistakedQuantity === 0
                                          ? "text-emerald-800 bg-evenvibe-light border border-emerald-200"
                                          : "text-evenvibe-deep bg-evenvibe-light border border-evenvibe-light"
                                      }`}
                                    >
                                      {row.outputQuantity}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-mono">—</span>
                                  )}
                                </td>

                                {/* Status Badge */}
                                <td className="py-2 px-3">
                                  {row.statusType === "not_entered" ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-medium"
                                    >
                                      Enter Quantity
                                    </Badge>
                                  ) : row.mistakedQuantity !== null && row.mistakedQuantity > 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-semibold"
                                    >
                                      Complete ({row.mistakedQuantity} Mistaked)
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-evenvibe-light text-emerald-800 border-emerald-300 text-[10px] font-semibold"
                                    >
                                      Complete
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                        {/* Group Totals Footer */}
                        <tfoot>
                          <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300 text-xs">
                            <td className="py-2 px-3 border-r border-slate-200 uppercase text-[10px] font-bold">
                              Total
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200">
                              {group.inputTotal}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 text-amber-900 font-black">
                              {group.mistakedTotal}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-evenvibe-deep">
                              {group.outputTotal}
                            </td>
                            <td className="py-2 px-3">
                              {group.allSizesEntered ? (
                                <span className="text-evenvibe-deep font-bold">Complete</span>
                              ) : (
                                <span className="text-amber-700 font-medium">In Progress</span>
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile Card View (Section 2 & 19: Row becomes one vertical card) */}
                    <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
                      {group.sizeRows.map((row) => {
                        const isRowEntered = row.mistakedQuantity !== null;
                        const isMistaked = row.statusType === "mistaked";

                        return (
                          <MobileCard
                            key={`mob-${row.rowKey}`}
                            className={`border ${
                              !isRowEntered
                                ? "border-amber-300 bg-amber-50/20"
                                : isMistaked
                                ? "border-amber-200 bg-white"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                              <span className="font-bold text-sm text-slate-900">Size: {row.size}</span>
                              {row.statusType === "not_entered" ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-medium"
                                >
                                  Enter Quantity
                                </Badge>
                              ) : row.mistakedQuantity !== null && row.mistakedQuantity > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-semibold"
                                >
                                  Complete ({row.mistakedQuantity} Mistaked)
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-evenvibe-light text-emerald-800 border-emerald-300 text-[10px] font-semibold"
                                >
                                  Complete
                                </Badge>
                              )}
                            </div>

                            <MobileCardField
                              label={`Input from ${previousStageDisplayName}`}
                              value={
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <span>{row.inputQuantity}</span>
                                  <span className="text-xs text-slate-500 font-normal">
                                    {row.inputQuantity === 1 ? "piece" : "pieces"}
                                  </span>
                                </div>
                              }
                            />

                            <MobileCardField
                              label={`Actual Mistaked Quantity (${stageDisplayName})`}
                              value={
                                isStageReadOnly ? (
                                  <span className="font-bold text-slate-900 px-2.5 py-1 bg-slate-100 rounded text-xs font-mono inline-block">
                                    {row.mistakedQuantity !== null ? row.mistakedQuantity : "—"}
                                  </span>
                                ) : (
                                  <div className="w-full pt-0.5">
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      placeholder="Enter mistaked qty"
                                      value={actualInputs[row.rowKey] ?? ""}
                                      onChange={(e) => handleInputChange(row.rowKey, e.target.value)}
                                      className={`h-9 text-xs font-mono font-bold text-slate-900 bg-white w-full ${
                                        !isRowEntered
                                          ? "border-amber-300 ring-1 ring-amber-200 focus:border-amber-400 focus:ring-amber-300"
                                          : "border-slate-300 focus:border-evenvibe-primary"
                                      }`}
                                    />
                                  </div>
                                )
                              }
                            />

                            <MobileCardField
                              label="Output (Input - Mistaked)"
                              value={
                                row.outputQuantity !== null ? (
                                  <span
                                    className={`inline-block font-mono text-xs px-2.5 py-0.5 rounded font-bold ${
                                      row.mistakedQuantity === 0
                                        ? "text-emerald-800 bg-evenvibe-light border border-emerald-200"
                                        : "text-evenvibe-deep bg-evenvibe-light border border-evenvibe-light"
                                    }`}
                                  >
                                    {row.outputQuantity} pieces
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">—</span>
                                )
                              }
                            />
                          </MobileCard>
                        );
                      })}

                      {/* Mobile Group Total Summary Card */}
                      <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs space-y-1.5">
                        <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Group Total Summary</div>
                        <div className="flex items-center justify-between text-slate-800">
                          <span>Total Input:</span>
                          <strong>{group.inputTotal}</strong>
                        </div>
                        <div className="flex items-center justify-between text-amber-900">
                          <span>Total Mistaked:</span>
                          <strong>{group.mistakedTotal ?? "—"}</strong>
                        </div>
                        <div className="flex items-center justify-between text-evenvibe-deep font-bold">
                          <span>Total Output:</span>
                          <strong>{group.outputTotal ?? "—"}</strong>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                          <span>Status:</span>
                          {group.allSizesEntered ? (
                            <span className="text-evenvibe-deep font-bold">✓ Complete</span>
                          ) : (
                            <span className="text-amber-700 font-semibold">In Progress</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
