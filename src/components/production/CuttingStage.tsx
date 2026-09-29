"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Scissors,
  Palette,
  Search,
  Download,
  Printer,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  School,
  Sparkles,
  Info,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  ReqItemSnapshot,
  StoredCuttingItem,
  calculateCuttingRequirements,
  CuttingCalculationResult,
  CuttingGroupSection,
  buildCuttingGroupKey,
  buildCuttingSizeRowKey,
  OrderStudentDetail,
  ClassStudentSummary,
} from "@/lib/production/cuttingCalculations";
import { exportCuttingExcel } from "@/lib/production/exportCuttingExcel";
import {
  saveOrderCuttingItemsAction,
  completeCuttingStageAction,
} from "@/app/(admin)/admin/production/actions";
import { OrderWorkflowStage } from "@/lib/productionWorkflow";
import { Shuffle } from "lucide-react";

interface CuttingStageProps {
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  requirementItems: ReqItemSnapshot[];
  savedCuttingItems: StoredCuttingItem[];
  currentStage: string;
  isLocked?: boolean;
  orderStudents?: OrderStudentDetail[];
  totalStudents?: number;
  isCuttingCompleted?: boolean;
  isAwaitingSequence?: boolean;
  onCuttingCompleted?: (workflows?: OrderWorkflowStage[]) => void;
  onOpenSequenceModal?: () => void;
  onCuttingUpdated?: (updated: StoredCuttingItem[]) => void;
  onStageAdvanced?: () => void;
  onCalculationResultChange?: (result: CuttingCalculationResult) => void;
  onPrint?: () => void;
}

export default function CuttingStage({
  orderId,
  orderNumber,
  schoolName = "",
  requirementItems,
  savedCuttingItems: initialSavedCuttingItems,
  currentStage,
  isLocked = false,
  orderStudents,
  totalStudents,
  isCuttingCompleted = false,
  isAwaitingSequence = false,
  onCuttingCompleted,
  onOpenSequenceModal,
  onCuttingUpdated,
  onStageAdvanced,
  onCalculationResultChange,
  onPrint,
}: CuttingStageProps) {
  // Local input state: rowKey -> string value (for smooth typing of whole numbers)
  const [cutInputs, setCutInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    (initialSavedCuttingItems || []).forEach((item) => {
      if (typeof item.cut_quantity === "number" && item.cut_quantity >= 0) {
        const groupKey = buildCuttingGroupKey(
          item.item_name,
          item.style_id,
          item.style_name,
          item.color
        );
        const rowKey = buildCuttingSizeRowKey(groupKey, item.size);
        init[rowKey] = String(item.cut_quantity);
      }
    });
    return init;
  });

  // Re-synchronize inputs when switching orders or when saved cutting items update
  const [prevOrderId, setPrevOrderId] = useState(orderId);
  const [prevSavedCuttingItems, setPrevSavedCuttingItems] = useState(initialSavedCuttingItems);
  if (orderId !== prevOrderId || initialSavedCuttingItems !== prevSavedCuttingItems) {
    setPrevOrderId(orderId);
    setPrevSavedCuttingItems(initialSavedCuttingItems);
    const updated: Record<string, string> = {};
    (initialSavedCuttingItems || []).forEach((item) => {
      if (typeof item.cut_quantity === "number" && item.cut_quantity >= 0) {
        const groupKey = buildCuttingGroupKey(
          item.item_name,
          item.style_id,
          item.style_name,
          item.color
        );
        const rowKey = buildCuttingSizeRowKey(groupKey, item.size);
        updated[rowKey] = String(item.cut_quantity);
      }
    });
    setCutInputs(updated);
  }

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemFilter, setSelectedItemFilter] = useState("ALL");
  const [selectedStyleFilter, setSelectedStyleFilter] = useState("ALL");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");

  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Dialog state for Class Breakdown (by uniform size)
  const [selectedGroupForClassModal, setSelectedGroupForClassModal] =
    useState<CuttingGroupSection | null>(null);

  // Dialog state for Class Students & Uniform Details Modal
  const [selectedClassForStudentModal, setSelectedClassForStudentModal] =
    useState<ClassStudentSummary | null>(null);

  // Authoritative live calculation result
  const calculationResult = useMemo(() => {
    return calculateCuttingRequirements(
      requirementItems,
      initialSavedCuttingItems,
      cutInputs,
      orderStudents,
      totalStudents || 0
    );
  }, [requirementItems, initialSavedCuttingItems, cutInputs, orderStudents, totalStudents]);

  // Synchronize live calculation result with parent (for print view)
  useEffect(() => {
    onCalculationResultChange?.(calculationResult);
  }, [calculationResult, onCalculationResultChange]);

  // Filter option lists
  const filterOptions = useMemo(() => {
    const items = new Set<string>();
    const styles = new Set<string>();
    const colors = new Set<string>();

    calculationResult.groups.forEach((g) => {
      if (g.itemName) items.add(g.itemName);
      if (g.cleanStyleName) styles.add(g.cleanStyleName);
      if (g.displayColor !== "—") colors.add(g.displayColor);
    });

    return {
      items: Array.from(items).sort((a, b) => a.localeCompare(b)),
      styles: Array.from(styles).sort((a, b) => a.localeCompare(b)),
      colors: Array.from(colors).sort((a, b) => a.localeCompare(b)),
    };
  }, [calculationResult.groups]);

  // Filtered groups for display
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return calculationResult.groups.filter((g) => {
      if (selectedItemFilter !== "ALL" && g.itemName !== selectedItemFilter) {
        return false;
      }
      if (selectedStyleFilter !== "ALL" && g.cleanStyleName !== selectedStyleFilter) {
        return false;
      }
      if (selectedColorFilter !== "ALL" && g.displayColor !== selectedColorFilter) {
        return false;
      }
      if (!q) return true;

      const matchesGroup =
        g.itemName.toLowerCase().includes(q) ||
        g.cleanStyleName.toLowerCase().includes(q) ||
        g.displayColor.toLowerCase().includes(q);

      const matchesSize = g.sizeRows.some((r) => r.size.toLowerCase().includes(q));

      return matchesGroup || matchesSize;
    });
  }, [
    calculationResult.groups,
    searchQuery,
    selectedItemFilter,
    selectedStyleFilter,
    selectedColorFilter,
  ]);

  // Handle cut quantity input change
  const handleCutChange = (rowKey: string, value: string) => {
    if (isCuttingCompletedEffective || isLocked) return;
    const trimmed = value.trim();
    // Allow empty string or non-negative integers only (no decimals, no negatives)
    if (trimmed === "" || /^\d+$/.test(trimmed)) {
      setCutInputs((prev) => ({
        ...prev,
        [rowKey]: trimmed,
      }));
    }
  };

  // Save Cutting Data Action
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const itemsToSave: {
        item_name: string;
        style_id?: string | null;
        style_name?: string | null;
        color?: string | null;
        size: string;
        cut_quantity: number;
      }[] = [];

      calculationResult.groups.forEach((g) => {
        g.sizeRows.forEach((r) => {
          const raw = cutInputs[r.rowKey];
          if (raw !== undefined && raw.trim() !== "") {
            const cutNum = parseInt(raw.trim(), 10);
            if (!isNaN(cutNum) && cutNum >= 0) {
              itemsToSave.push({
                item_name: g.itemName,
                style_id: g.styleId,
                style_name: g.styleName,
                color: g.color,
                size: r.size,
                cut_quantity: cutNum,
              });
            }
          }
        });
      });

      if (itemsToSave.length === 0) {
        toast.error("Enter at least one valid Cut Quantity before saving.");
        setIsSaving(false);
        return;
      }

      const res = await saveOrderCuttingItemsAction(orderId, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Saved cutting data for ${itemsToSave.length} size(s) successfully.`);
        if (onCuttingUpdated) {
          const updatedCuttingMap = new Map<string, StoredCuttingItem>();
          (initialSavedCuttingItems || []).forEach((it) => {
            const k = buildCuttingSizeRowKey(
              buildCuttingGroupKey(it.item_name, it.style_id, it.style_name, it.color),
              it.size
            );
            updatedCuttingMap.set(k, it);
          });
          itemsToSave.forEach((it) => {
            const k = buildCuttingSizeRowKey(
              buildCuttingGroupKey(it.item_name, it.style_id, it.style_name, it.color),
              it.size
            );
            const reqRow = calculationResult.groups
              .find(
                (g) =>
                  g.itemName === it.item_name &&
                  g.cleanStyleName === (it.style_name || "Standard") &&
                  g.displayColor === (it.color || "—")
              )
              ?.sizeRows.find((r) => r.size === it.size);

            updatedCuttingMap.set(k, {
              order_id: orderId,
              item_name: it.item_name,
              style_id: it.style_id || null,
              style_name: it.style_name || null,
              color: it.color || null,
              size: it.size,
              required_quantity: reqRow?.required || 0,
              cut_quantity: it.cut_quantity,
              result_quantity: it.cut_quantity - (reqRow?.required || 0),
            });
          });
          onCuttingUpdated(Array.from(updatedCuttingMap.values()));
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save cutting data");
    } finally {
      setIsSaving(false);
    }
  };

  // Complete Cutting Stage Action
  const handleCompleteCutting = async () => {
    if (!calculationResult.allRowsEntered) {
      toast.error("Enter cut quantity for all required sizes before completing Cutting.");
      return;
    }

    setIsCompleting(true);
    try {
      // 1. First ensure all current inputs are saved to database
      const itemsToSave: {
        item_name: string;
        style_id?: string | null;
        style_name?: string | null;
        color?: string | null;
        size: string;
        cut_quantity: number;
      }[] = [];

      calculationResult.groups.forEach((g) => {
        g.sizeRows.forEach((r) => {
          const cutNum = r.cut !== null ? r.cut : 0;
          itemsToSave.push({
            item_name: g.itemName,
            style_id: g.styleId,
            style_name: g.styleName,
            color: g.color,
            size: r.size,
            cut_quantity: cutNum,
          });
        });
      });

      const saveRes = await saveOrderCuttingItemsAction(orderId, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        setIsCompleting(false);
        return;
      }

      // 2. Advance stage to cutting_completed
      const compRes = await completeCuttingStageAction(
        orderId,
        `Cutting stage completed: ${calculationResult.totalCutPieces} pieces cut for ${calculationResult.totalRequiredPieces} required pieces.`
      );

      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success(
          "Cutting completed successfully! Arrange the next production sequence."
        );
        if (onCuttingCompleted) {
          onCuttingCompleted(compRes.workflows);
        } else if (onStageAdvanced) {
          onStageAdvanced();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete cutting stage");
    } finally {
      setIsCompleting(false);
    }
  };

  // Excel Export
  const handleExportExcel = async () => {
    try {
      await exportCuttingExcel({
        orderNumber,
        schoolName,
        calculationResult,
      });
      toast.success("Cutting Excel report exported successfully.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export Excel report");
    }
  };

  // Print Report
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const isCuttingCompletedEffective = isCuttingCompleted || false;
  const isCurrentStageCutting = currentStage === "cutting" && !isCuttingCompletedEffective;

  // EMPTY STATE: If the CURRENT ORDER has no Stock Size Requirements (Requirement 14)
  if (calculationResult.groups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-evenvibe-light text-evenvibe-deep border border-evenvibe-light">
                STAGE 3
              </span>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Scissors className="h-5 w-5 text-evenvibe-primary" />
                Cutting Stage — Actual Cut vs Required Quantity
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Enter the actual number of pieces cut for each size based on Stock Size Requirements.
            </p>
          </div>
        </div>

        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3 shadow-2xs">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Scissors className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-slate-800">
            No cutting requirements are available for this order.
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Stock Size Requirements have not been submitted or recorded for Order #{orderNumber}.
            Cutting data cannot be entered or completed without stock size requirements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Information & Overall Stage Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-evenvibe-light text-evenvibe-deep border border-evenvibe-light">
              STAGE 3
            </span>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Scissors className="h-5 w-5 text-evenvibe-primary" />
              Cutting Stage — Actual Cut vs Required Quantity
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enter the actual number of pieces cut for each size. Track required quantities, completed
            cuts, pending pieces, and extra cuts.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs gap-1.5 h-8 font-medium shadow-2xs w-full sm:w-auto"
          >
            <Download className="h-3.5 w-3.5 text-evenvibe-primary" />
            Export Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs gap-1.5 h-8 font-medium shadow-2xs w-full sm:w-auto"
          >
            <Printer className="h-3.5 w-3.5 text-slate-600" />
            Print Cutting
          </Button>

          {isCuttingCompletedEffective && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs px-2.5 py-1 font-semibold flex items-center justify-center gap-1.5 shadow-2xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-evenvibe-primary" />
                Cutting Completed ✓
              </Badge>
              {isAwaitingSequence && onOpenSequenceModal && (
                <Button
                  size="sm"
                  onClick={onOpenSequenceModal}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs gap-1.5 h-8 font-semibold shadow-xs w-full sm:w-auto"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Arrange Production Sequence
                </Button>
              )}
            </div>
          )}

          {isCurrentStageCutting && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="-evenvibe-primary bg-evenvibe-light/50 text-evenvibe-deep hover:bg-evenvibe-light text-xs gap-1.5 h-8 font-medium shadow-2xs w-full sm:w-auto"
              >
                <Save className="h-3.5 w-3.5 text-evenvibe-deep" />
                {isSaving ? "Saving..." : "Save Cutting Data"}
              </Button>

              <Button
                size="sm"
                onClick={handleCompleteCutting}
                disabled={isCompleting || !calculationResult.allRowsEntered}
                className={`text-xs gap-1.5 h-8 font-semibold shadow-xs w-full sm:w-auto ${
                  calculationResult.allRowsEntered
                    ? "bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                }`}
                title={
                  !calculationResult.allRowsEntered
                    ? `Enter actual cut quantities for all ${calculationResult.missingSizesCount} missing size(s) to unlock completion`
                    : "Complete cutting and unlock sequence arrangement"
                }
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {isCompleting ? "Completing..." : "Complete Cutting"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 2. Overall Cutting Summary Cards (Section 11 & 28) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Students */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Students
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">
                {(calculationResult.totalStudents || 0).toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">students</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Unique students in this order</p>
          </CardContent>
        </Card>

        {/* Total Required */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Required
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">
                {calculationResult.totalRequiredPieces.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">pieces</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Authoritative order requirement</p>
          </CardContent>
        </Card>

        {/* Total Cut */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Cut
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-evenvibe-deep">
                {calculationResult.totalCutPieces.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">pieces</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Actual pieces cut by staff</p>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card
          className={`shadow-2xs bg-white ${
            calculationResult.totalPendingPieces > 0
              ? "border-amber-200 bg-amber-50/20"
              : "border-slate-200"
          }`}
        >
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
              Pending
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-black ${
                  calculationResult.totalPendingPieces > 0 ? "text-status-warning" : "text-slate-900"
                }`}
              >
                {calculationResult.totalPendingPieces.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">pieces</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Still required to be cut</p>
          </CardContent>
        </Card>

        {/* Extra Cut */}
        <Card
          className={`shadow-2xs bg-white ${
            calculationResult.totalExtraCutPieces > 0
              ? "border-evenvibe-light bg-evenvibe-light/20"
              : "border-slate-200"
          }`}
        >
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-evenvibe-deep uppercase tracking-wider block">
              Extra Cut
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-black ${
                  calculationResult.totalExtraCutPieces > 0 ? "text-evenvibe-deep" : "text-slate-900"
                }`}
              >
                {calculationResult.totalExtraCutPieces.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">pieces</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Pieces cut exceeding requirement</p>
          </CardContent>
        </Card>
      </div>

      {/* 2b. Class-Wise Students in this Order */}
      {calculationResult.classSummaries && calculationResult.classSummaries.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-evenvibe-primary" />
                <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                  Class-Wise Students in this Order
                </h4>
                <Badge variant="outline" className="bg-evenvibe-light text-evenvibe-deep border-evenvibe-light text-[10px]">
                  {calculationResult.totalStudents} Students across {calculationResult.classSummaries.length} Classes
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative student list and uniform requirements included in this order.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {calculationResult.classSummaries.map((cs) => (
              <div
                key={cs.className}
                className="bg-slate-50 hover:bg-evenvibe-light/40 p-3 rounded-lg border border-slate-200 hover:border-evenvibe-light transition-colors flex flex-col justify-between gap-2"
              >
                <div>
                  <span className="text-xs font-bold text-slate-900 block truncate" title={cs.className}>
                    {cs.className}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {cs.studentCount} {cs.studentCount === 1 ? "Student" : "Students"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedClassForStudentModal(cs)}
                  className="h-7 text-[11px] font-medium border-slate-300 text-slate-700 hover:text-evenvibe-deep hover:bg-white w-full shadow-2xs"
                >
                  View Details
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Filters & Search Bar (Section 27) */}
      <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search item, style, color or size..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white border-slate-200"
            />
          </div>

          {/* Item Filter */}
          <select
            suppressHydrationWarning
            value={selectedItemFilter}
            onChange={(e) => setSelectedItemFilter(e.target.value)}
            className="h-8 text-xs bg-white border border-slate-200 rounded-md px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-evenvibe-primary"
          >
            <option value="ALL">All Items</option>
            {filterOptions.items.map((it) => (
              <option key={it} value={it}>
                {it}
              </option>
            ))}
          </select>

          {/* Style Filter */}
          <select
            suppressHydrationWarning
            value={selectedStyleFilter}
            onChange={(e) => setSelectedStyleFilter(e.target.value)}
            className="h-8 text-xs bg-white border border-slate-200 rounded-md px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-evenvibe-primary"
          >
            <option value="ALL">All Styles</option>
            {filterOptions.styles.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Color Filter */}
          <select
            suppressHydrationWarning
            value={selectedColorFilter}
            onChange={(e) => setSelectedColorFilter(e.target.value)}
            className="h-8 text-xs bg-white border border-slate-200 rounded-md px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-evenvibe-primary"
          >
            <option value="ALL">All Colors</option>
            {filterOptions.colors.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        </div>

        {/* Status Count Indicator */}
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>
            Showing <strong>{filteredGroups.length}</strong> of{" "}
            <strong>{calculationResult.groups.length}</strong> style & color group(s)
          </span>
          {!calculationResult.allRowsEntered && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
              {calculationResult.missingSizesCount} size(s) pending entry
            </Badge>
          )}
        </div>
      </div>

      {/* 4. Style + Color Separate Sections (HARD business rule: Section 3 & 7) */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
          No uniform items match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => {
            return (
              <Card
                key={group.groupKey}
                className="border-slate-200 shadow-2xs overflow-hidden bg-white"
              >
                {/* Section Header */}
                <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h4 className="text-sm font-bold text-slate-900 tracking-wide">
                      {group.displayName}
                    </h4>

                    {/* Color Pill */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white border border-slate-300 text-slate-800 shadow-2xs">
                      <Palette className="h-3.5 w-3.5 text-evenvibe-primary" />
                      <span>Color: {group.displayColor}</span>
                    </div>

                    {/* Section completion badge */}
                    {group.allSizesEntered && group.pendingTotal === 0 ? (
                      <Badge className="bg-evenvibe-primary text-white text-[10px] px-2 py-0">
                        Section Complete
                      </Badge>
                    ) : !group.allSizesEntered ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] px-2 py-0"
                      >
                        Cut Quantity Needed
                      </Badge>
                    ) : null}
                  </div>

                  {/* Right Header: Mini Summary & View Class Details Button */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-3 text-xs bg-white px-3 py-1 rounded-md border border-slate-200">
                      <span>
                        Required: <strong>{group.requiredTotal}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>
                        Cut: <strong>{group.cutTotal}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span
                        className={
                          group.pendingTotal > 0 ? "text-amber-700 font-bold" : "text-slate-600"
                        }
                      >
                        Pending: <strong>{group.pendingTotal}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span
                        className={
                          group.extraCutTotal > 0 ? "text-evenvibe-deep font-bold" : "text-slate-600"
                        }
                      >
                        Extra Cut: <strong>{group.extraCutTotal}</strong>
                      </span>
                    </div>

                    {/* View Class Details Button (Section 12 & 13) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedGroupForClassModal(group)}
                      className="text-xs h-7 gap-1 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                    >
                      <School className="h-3.5 w-3.5 text-evenvibe-primary" />
                      View Class Details
                    </Button>
                  </div>
                </div>

                {/* Section Table (Section 7, 8, 28) */}
                <CardContent className="p-0">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-4 w-28">Size</th>
                          <th className="py-2.5 px-4 text-right w-36">Required</th>
                          <th className="py-2.5 px-4 text-right w-44">Cut</th>
                          <th className="py-2.5 px-4 text-right w-36">Result</th>
                          <th className="py-2.5 px-4 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.sizeRows.map((row) => {
                          const inputValue =
                            cutInputs[row.rowKey] !== undefined
                              ? cutInputs[row.rowKey]
                              : row.cut !== null
                              ? String(row.cut)
                              : "";

                          return (
                            <tr
                              key={row.rowKey}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              {/* Size (Natural Ordering) */}
                              <td className="py-2.5 px-4 font-bold text-slate-900 text-sm">
                                {row.size}
                              </td>

                              {/* Required (Authoritative read-only) */}
                              <td className="py-2.5 px-4 text-right font-semibold text-slate-800 text-sm">
                                {row.required}
                              </td>

                              {/* Cut Quantity (Editable whole number >= 0) */}
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex justify-end">
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={inputValue}
                                    placeholder="Enter cut"
                                    disabled={!isCurrentStageCutting || isLocked}
                                    onChange={(e) => handleCutChange(row.rowKey, e.target.value)}
                                    className={`h-8 w-28 text-right text-xs font-mono font-bold ${
                                      inputValue === ""
                                        ? "border-amber-300 bg-amber-50/30 text-amber-900 focus-visible:ring-amber-400"
                                        : "border-slate-300 bg-white text-slate-900 focus-visible:-evenvibe-primary"
                                    }`}
                                  />
                                </div>
                              </td>

                              {/* Result Quantity (Cut - Required) */}
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-sm">
                                {row.resultDisplay !== "—" ? (
                                  <span
                                    className={
                                      row.result === 0
                                        ? "text-evenvibe-deep"
                                        : (row.result || 0) > 0
                                        ? "text-evenvibe-deep font-bold"
                                        : "text-amber-700 font-bold"
                                    }
                                  >
                                    {row.resultDisplay}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal">—</span>
                                )}
                              </td>

                              {/* Status Display (Section 6, 8, 28) */}
                              <td className="py-2.5 px-4 text-left">
                                {row.statusType === "complete" ? (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-evenvibe-primary" />
                                    <span>Complete</span>
                                  </div>
                                ) : row.statusType === "pending" ? (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                                    <AlertCircle className="h-3.5 w-3.5 text-status-warning" />
                                    <span>{row.statusText}</span>
                                  </div>
                                ) : row.statusType === "extra_cut" ? (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-evenvibe-light text-evenvibe-deep border border-evenvibe-light">
                                    <Sparkles className="h-3.5 w-3.5 text-evenvibe-primary" />
                                    <span>{row.statusText}</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                    <Info className="h-3.5 w-3.5 text-slate-400" />
                                    <span>Pending Entry</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Section Footer */}
                      <tfoot>
                        <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200 text-xs">
                          <td className="py-2 px-4 uppercase text-[11px] text-slate-600 tracking-wider">
                            Total
                          </td>
                          <td className="py-2 px-4 text-right text-sm">
                            {group.requiredTotal}
                          </td>
                          <td className="py-2 px-4 text-right text-sm text-evenvibe-deep">
                            {group.cutTotal}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-sm">
                            {group.pendingTotal > 0 || group.extraCutTotal > 0 ? (
                              <span className="text-slate-600 text-[11px]">
                                {group.extraCutTotal > 0 ? `+${group.extraCutTotal} ` : ""}
                                {group.pendingTotal > 0 ? `-${group.pendingTotal}` : ""}
                              </span>
                            ) : (
                              <span className="text-evenvibe-deep">0</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-left text-xs font-semibold">
                            {group.pendingTotal === 0 && group.extraCutTotal === 0 && group.allSizesEntered ? (
                              <span className="text-evenvibe-deep">All Sizes Complete</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                {group.pendingTotal > 0 && (
                                  <span className="text-amber-700 font-semibold">
                                    {group.pendingTotal} Pending
                                  </span>
                                )}
                                {group.pendingTotal > 0 && group.extraCutTotal > 0 && (
                                  <span className="text-slate-300">•</span>
                                )}
                                {group.extraCutTotal > 0 && (
                                  <span className="text-evenvibe-deep font-semibold">
                                    {group.extraCutTotal} Extra Cut
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile Cards View (Section 2 & 19) */}
                  <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
                    {group.sizeRows.map((row) => {
                      const inputValue =
                        cutInputs[row.rowKey] !== undefined
                          ? cutInputs[row.rowKey]
                          : row.cut !== null
                          ? String(row.cut)
                          : "";

                      return (
                        <MobileCard
                          key={`mob-cut-${row.rowKey}`}
                          className="border border-slate-200 bg-white"
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="font-bold text-sm text-slate-900">Size: {row.size}</span>
                            {row.statusType === "complete" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 border-0">
                                Complete
                              </Badge>
                            ) : row.statusType === "pending" ? (
                              <Badge className="bg-amber-100 text-amber-900 text-[10px] px-2 py-0.5 border-0">
                                {row.statusText}
                              </Badge>
                            ) : row.statusType === "extra_cut" ? (
                              <Badge className="bg-evenvibe-light text-evenvibe-deep text-[10px] px-2 py-0.5 border-0">
                                {row.statusText}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-500 text-[10px] px-2 py-0.5">
                                Pending Entry
                              </Badge>
                            )}
                          </div>

                          <MobileCardField
                            label="Required Quantity"
                            value={<span className="font-bold text-slate-900">{row.required} pieces</span>}
                          />

                          <MobileCardField
                            label="Physical Cut Quantity (Admin Input)"
                            value={
                              <div className="w-full pt-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={inputValue}
                                  placeholder="Enter cut qty"
                                  disabled={!isCurrentStageCutting || isLocked}
                                  onChange={(e) => handleCutChange(row.rowKey, e.target.value)}
                                  className={`h-9 w-full text-xs font-mono font-bold ${
                                    inputValue === ""
                                      ? "border-amber-300 bg-amber-50/30 text-amber-900 focus-visible:ring-amber-400"
                                      : "border-slate-300 bg-white text-slate-900 focus-visible:-evenvibe-primary"
                                  }`}
                                />
                              </div>
                            }
                          />

                          <MobileCardField
                            label="Result (Cut - Required)"
                            value={
                              row.resultDisplay !== "—" ? (
                                <span
                                  className={`font-mono font-bold text-xs ${
                                    row.result === 0
                                      ? "text-evenvibe-deep"
                                      : (row.result || 0) > 0
                                      ? "text-evenvibe-deep font-bold"
                                      : "text-amber-700 font-bold"
                                  }`}
                                >
                                  {row.resultDisplay} pieces
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">—</span>
                              )
                            }
                          />
                        </MobileCard>
                      );
                    })}

                    {/* Mobile Summary Card for Group */}
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs space-y-1.5">
                      <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Group Total Summary</div>
                      <div className="flex items-center justify-between text-slate-800">
                        <span>Total Required:</span>
                        <strong>{group.requiredTotal}</strong>
                      </div>
                      <div className="flex items-center justify-between text-evenvibe-deep font-bold">
                        <span>Total Cut:</span>
                        <strong>{group.cutTotal}</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Pending / Extra:</span>
                        <span>
                          {group.pendingTotal > 0 || group.extraCutTotal > 0 ? (
                            <>
                              {group.extraCutTotal > 0 ? `+${group.extraCutTotal} extra ` : ""}
                              {group.pendingTotal > 0 ? `-${group.pendingTotal} pending` : ""}
                            </>
                          ) : (
                            <strong className="text-evenvibe-deep">0</strong>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 5. Bottom Save / Complete Bar (Sticky on Desktop) */}
      {isCuttingCompletedEffective && (
        <div className="bg-emerald-50/90 p-4 rounded-xl border border-emerald-300 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-950 font-medium">
            <CheckCircle2 className="h-4 w-4 text-evenvibe-primary shrink-0" />
            <span>
              Cutting stage completed. Total cut output: <strong>{calculationResult.totalCutPieces} pieces</strong>.
            </span>
          </div>
          {isAwaitingSequence && onOpenSequenceModal && (
            <Button
              size="sm"
              onClick={onOpenSequenceModal}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs font-semibold shadow-xs gap-1.5 h-9 px-4"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Arrange Production Sequence →
            </Button>
          )}
        </div>
      )}

      {isCurrentStageCutting && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {calculationResult.allRowsEntered ? (
              <span className="text-evenvibe-deep font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                All required cut quantities have been entered. You can now complete the Cutting stage.
              </span>
            ) : (
              <span className="text-amber-800 font-medium flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-status-warning shrink-0" />
                Enter actual cut quantities for all {calculationResult.missingSizesCount} missing
                size(s) to enable [Complete Cutting].
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs -evenvibe-primary text-evenvibe-deep hover:bg-evenvibe-light font-medium h-9 gap-1.5 shadow-2xs"
            >
              <Save className="h-3.5 w-3.5 text-evenvibe-deep" />
              {isSaving ? "Saving..." : "Save Cutting Data"}
            </Button>

            <Button
              size="sm"
              onClick={handleCompleteCutting}
              disabled={isCompleting || !calculationResult.allRowsEntered}
              className={`text-xs h-9 px-4 font-semibold gap-1.5 shadow-sm ${
                calculationResult.allRowsEntered
                  ? "bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
              }`}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {isCompleting ? "Completing..." : "Complete Cutting"}
            </Button>
          </div>
        </div>
      )}

      {/* 6. Class Breakdown Modal (Section 12 & 13) */}
      <Dialog
        open={!!selectedGroupForClassModal}
        onOpenChange={(open) => !open && setSelectedGroupForClassModal(null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <School className="h-4 w-4 text-evenvibe-primary" />
              Class-Wise Requirement Breakdown
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedGroupForClassModal?.displayName} (Color:{" "}
              {selectedGroupForClassModal?.displayColor})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {selectedGroupForClassModal?.sizeRows.map((row) => (
              <div
                key={row.rowKey}
                className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 text-xs"
              >
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <span className="font-extrabold text-sm text-slate-900">
                    Size: {row.size}
                  </span>
                  <span className="text-slate-600 font-semibold">
                    Total Required: <strong className="text-slate-900">{row.required}</strong> pieces
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {row.classBreakdown.map((cb, idx) => (
                    <div
                      key={`${cb.className}-${cb.sectionName || ""}-${idx}`}
                      className="bg-white p-2 rounded border border-slate-200 flex justify-between items-center"
                    >
                      <span className="font-medium text-slate-700">
                        {cb.className}
                        {cb.sectionName ? ` (${cb.sectionName})` : ""}
                      </span>
                      <span className="font-bold text-slate-900 font-mono">
                        {cb.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 7. Class Students & Uniform Details Modal */}
      <Dialog
        open={!!selectedClassForStudentModal}
        onOpenChange={(open) => !open && setSelectedClassForStudentModal(null)}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-evenvibe-primary" />
              {selectedClassForStudentModal?.className} — Students & Uniform Requirements
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedClassForStudentModal?.students.length} student(s) belonging to {selectedClassForStudentModal?.className} in Order #{orderNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 overflow-y-auto pr-1 flex-1">
            {selectedClassForStudentModal?.students.map((student, sIdx) => (
              <div
                key={student.id || `${student.admissionNumber}-${sIdx}`}
                className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 text-xs"
              >
                {/* Student Identity */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900">
                      {student.studentName}
                    </span>
                    <span className="text-[11px] font-mono font-medium text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Adm: {student.admissionNumber || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-600 font-medium text-[11px]">
                    <span>
                      Class: <strong className="text-slate-800">{student.className}</strong>
                    </span>
                    {student.section && (
                      <span>
                        Sec: <strong className="text-slate-800">{student.section}</strong>
                      </span>
                    )}
                    {student.gender && (
                      <span className="capitalize">
                        Gender: <strong className="text-slate-800">{student.gender}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Student Uniform Requirements */}
                {student.uniforms && student.uniforms.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden sm:block">
                      <table className="w-full text-left text-xs bg-white rounded border border-slate-200 overflow-hidden">
                        <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-1.5 px-3">Item</th>
                            <th className="py-1.5 px-3">Style</th>
                            <th className="py-1.5 px-3">Color</th>
                            <th className="py-1.5 px-3">Size</th>
                            <th className="py-1.5 px-3 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {student.uniforms.map((uItem, uIdx) => (
                            <tr key={`${uItem.itemName}-${uItem.size}-${uIdx}`}>
                              <td className="py-1.5 px-3 font-semibold text-slate-900">{uItem.itemName}</td>
                              <td className="py-1.5 px-3 text-slate-600">{uItem.styleName || "Standard"}</td>
                              <td className="py-1.5 px-3 text-slate-600">{uItem.color || "—"}</td>
                              <td className="py-1.5 px-3 font-bold text-slate-800">{uItem.size}</td>
                              <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">{uItem.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="sm:hidden space-y-1.5">
                      {student.uniforms.map((uItem, uIdx) => (
                        <div
                          key={`mob-stu-${uItem.itemName}-${uItem.size}-${uIdx}`}
                          className="bg-white p-2.5 rounded border border-slate-200 text-xs flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{uItem.itemName}</span>
                            <span className="text-[11px] text-slate-500">
                              {uItem.styleName || "Standard"} • {uItem.color || "—"}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900 block">Size {uItem.size}</span>
                            <span className="text-[11px] text-slate-600 font-semibold">{uItem.quantity} pcs</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No uniform size items recorded for this student.</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
