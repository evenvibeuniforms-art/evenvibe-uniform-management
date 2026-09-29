"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shirt,
  Palette,
  Layers,
  Scale,
  Search,
  Download,
  Printer,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  ReqItemSnapshot,
  StoredInventoryMaterial,
  calculateInventoryRequirements,
  InventoryCalculationResult,
} from "@/lib/production/inventoryCalculations";
import { exportInventoryExcel } from "@/lib/production/exportInventoryExcel";
import {
  saveOrderInventoryMaterialsAction,
  completeInventoryStageAction,
} from "@/app/(admin)/admin/production/actions";

interface InventoryMaterialStageProps {
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  requirementItems: ReqItemSnapshot[];
  savedMaterials: StoredInventoryMaterial[];
  currentStage: string;
  isLocked?: boolean;
  onMaterialsUpdated?: (updated: StoredInventoryMaterial[]) => void;
  onStageAdvanced?: () => void;
  onCalculationResultChange?: (result: InventoryCalculationResult) => void;
}

export default function InventoryMaterialStage({
  orderId,
  orderNumber,
  schoolName = "",
  requirementItems,
  savedMaterials: initialSavedMaterials,
  currentStage,
  isLocked = false,
  onMaterialsUpdated,
  onStageAdvanced,
  onCalculationResultChange,
}: InventoryMaterialStageProps) {
  // Local input state: rowKey -> string value (to allow decimal typing like "225.")
  const [gramInputs, setGramInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    (initialSavedMaterials || []).forEach((sm) => {
      if (typeof sm.gram_per_piece === "number" && sm.gram_per_piece > 0) {
        const normItem = sm.item_name.trim().toLowerCase();
        const normStyleId = sm.style_id ? sm.style_id.trim().toLowerCase() : "no_style_id";
        const normStyleName = sm.style_name ? sm.style_name.trim().toLowerCase() : "no_style_name";
        const normColor = sm.color ? sm.color.trim().toLowerCase() : "no_color";
        const key = `${normItem}__${normStyleId}__${normStyleName}__${normColor}`;
        init[key] = String(sm.gram_per_piece);
      }
    });
    return init;
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemFilter, setSelectedItemFilter] = useState("ALL");
  const [selectedStyleFilter, setSelectedStyleFilter] = useState("ALL");
  const [selectedColorFilter, setSelectedColorFilter] = useState("ALL");

  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Execute authoritative calculation
  const calculationResult = useMemo(() => {
    // Build lookup from gramInputs
    const effectiveSaved: StoredInventoryMaterial[] = [];
    Object.entries(gramInputs).forEach(([key, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) {
        // Find in savedMaterials or construct key-matching object
        const parts = key.split("__");
        effectiveSaved.push({
          order_id: orderId,
          item_name: parts[0] || "",
          style_id: parts[1] !== "no_style_id" ? parts[1] : null,
          style_name: parts[2] !== "no_style_name" ? parts[2] : null,
          color: parts[3] !== "no_color" ? parts[3] : null,
          gram_per_piece: num,
          quantity: 0,
          total_grams: 0,
        });
      }
    });

    return calculateInventoryRequirements(requirementItems, effectiveSaved);
  }, [requirementItems, gramInputs, orderId]);

  // Synchronize live calculation result with parent (for print view)
  useEffect(() => {
    onCalculationResultChange?.(calculationResult);
  }, [calculationResult, onCalculationResultChange]);

  // Unique filter option lists
  const filterOptions = useMemo(() => {
    const items = new Set<string>();
    const styles = new Set<string>();
    const colors = new Set<string>();

    calculationResult.rows.forEach((r) => {
      if (r.itemName) items.add(r.itemName);
      if (r.cleanStyleName) styles.add(r.cleanStyleName);
      if (r.displayColor !== "—") colors.add(r.displayColor);
    });

    return {
      items: Array.from(items).sort((a, b) => a.localeCompare(b)),
      styles: Array.from(styles).sort((a, b) => a.localeCompare(b)),
      colors: Array.from(colors).sort((a, b) => a.localeCompare(b)),
    };
  }, [calculationResult.rows]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return calculationResult.rows.filter((r) => {
      if (selectedItemFilter !== "ALL" && r.itemName !== selectedItemFilter) {
        return false;
      }
      if (selectedStyleFilter !== "ALL" && r.cleanStyleName !== selectedStyleFilter) {
        return false;
      }
      if (selectedColorFilter !== "ALL" && r.displayColor !== selectedColorFilter) {
        return false;
      }
      if (!q) return true;

      return (
        r.itemName.toLowerCase().includes(q) ||
        (r.cleanStyleName && r.cleanStyleName.toLowerCase().includes(q)) ||
        r.displayColor.toLowerCase().includes(q)
      );
    });
  }, [calculationResult.rows, searchQuery, selectedItemFilter, selectedStyleFilter, selectedColorFilter]);

  // Handle gram input change
  const handleGramChange = (rowKey: string, value: string) => {
    // Only allow numbers and one decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setGramInputs((prev) => ({
        ...prev,
        [rowKey]: value,
      }));
    }
  };

  // Save Inventory Action
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const itemsToSave = calculationResult.rows
        .filter((r) => {
          const raw = gramInputs[r.rowKey];
          const num = parseFloat(raw);
          return !isNaN(num) && num > 0;
        })
        .map((r) => ({
          item_name: r.itemName,
          style_id: r.styleId,
          style_name: r.styleName,
          color: r.color,
          gram_per_piece: parseFloat(gramInputs[r.rowKey]),
        }));

      if (itemsToSave.length === 0) {
        toast.error("Enter at least one valid Gram / Piece value before saving.");
        setIsSaving(false);
        return;
      }

      const res = await saveOrderInventoryMaterialsAction(orderId, itemsToSave);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Inventory material requirements saved successfully.");
        if (onMaterialsUpdated) {
          onMaterialsUpdated(
            itemsToSave.map((it) => ({
              order_id: orderId,
              item_name: it.item_name,
              style_id: it.style_id || null,
              style_name: it.style_name || null,
              color: it.color || null,
              gram_per_piece: it.gram_per_piece,
              quantity: 0,
              total_grams: 0,
            }))
          );
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save inventory");
    } finally {
      setIsSaving(false);
    }
  };

  // Complete Inventory Action
  const handleCompleteInventory = async () => {
    if (!calculationResult.allRowsConfigured) {
      toast.error(
        `All ${calculationResult.missingCount} missing Gram / Piece values must be entered before completing Inventory.`
      );
      return;
    }

    setIsCompleting(true);
    try {
      // 1. First save all current inputs
      const itemsToSave = calculationResult.rows.map((r) => ({
        item_name: r.itemName,
        style_id: r.styleId,
        style_name: r.styleName,
        color: r.color,
        gram_per_piece: parseFloat(gramInputs[r.rowKey] || "0"),
      }));

      const saveRes = await saveOrderInventoryMaterialsAction(orderId, itemsToSave);
      if (saveRes.error) {
        toast.error(saveRes.error);
        setIsCompleting(false);
        return;
      }

      // 2. Advance stage to cutting
      const compRes = await completeInventoryStageAction(
        orderId,
        `Inventory material requirement verified: ${calculationResult.totalMaterialKg} kg across ${calculationResult.totalPieces} pieces.`
      );

      if (compRes.error) {
        toast.error(compRes.error);
      } else {
        toast.success("Inventory stage completed! Order has moved to Cutting.");
        if (onStageAdvanced) {
          onStageAdvanced();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete inventory");
    } finally {
      setIsCompleting(false);
    }
  };

  // Excel Export
  const handleExportExcel = async () => {
    try {
      await exportInventoryExcel({
        orderNumber,
        schoolName,
        calculationResult,
      });
      toast.success("Excel report exported successfully.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export Excel report");
    }
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  const isCurrentStageInventory = currentStage === "inventory";

  return (
    <div className="space-y-6">
      {/* 1. Header Information — Client-Friendly Language (Section 1) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                STAGE 2
              </span>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Inventory Material Requirement
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Material requirement for this order ({orderNumber})
              {schoolName && (
                <span className="ml-1 text-slate-600 font-medium">— {schoolName}</span>
              )}
              .
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="text-xs border-slate-300 hover:bg-slate-50 gap-1.5 h-8 font-medium text-slate-700 w-full sm:w-auto"
            >
              <Download className="h-3.5 w-3.5 text-evenvibe-primary" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs border-slate-300 hover:bg-slate-50 gap-1.5 h-8 font-medium text-slate-700 w-full sm:w-auto"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              Print Inventory
            </Button>
          </div>
        </div>

        {/* 2. Top Summary Cards (Section 11) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Styles */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Shirt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Styles</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {calculationResult.totalStyles}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Total Colors */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-evenvibe-light flex items-center justify-center shrink-0">
                <Palette className="h-5 w-5 text-evenvibe-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Colors</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {calculationResult.totalColors}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Total Pieces */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-evenvibe-light flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5 text-evenvibe-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Pieces</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {calculationResult.totalPieces.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Total Material */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-emerald-100 flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-evenvibe-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Material</p>
                <p className="text-2xl font-bold text-evenvibe-deep mt-0.5">
                  {calculationResult.totalMaterialKg} kg
                </p>
                {calculationResult.totalMaterialGrams > 0 && (
                  <p className="text-[10px] text-slate-400">
                    {calculationResult.totalMaterialGrams.toLocaleString()} g
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Simple Filters (Section 14 & 15) */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50/90 p-3 rounded-lg border border-slate-200">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              suppressHydrationWarning
              placeholder="Search item, style or color..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white text-xs h-9 border-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {filterOptions.items.length > 0 && (
              <select
                suppressHydrationWarning
                value={selectedItemFilter}
                onChange={(e) => setSelectedItemFilter(e.target.value)}
                aria-label="Filter by Item"
                className="h-9 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Items</option>
                {filterOptions.items.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </select>
            )}

            {filterOptions.styles.length > 0 && (
              <select
                suppressHydrationWarning
                value={selectedStyleFilter}
                onChange={(e) => setSelectedStyleFilter(e.target.value)}
                aria-label="Filter by Style"
                className="h-9 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Styles</option>
                {filterOptions.styles.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            )}

            {filterOptions.colors.length > 0 && (
              <select
                suppressHydrationWarning
                value={selectedColorFilter}
                onChange={(e) => setSelectedColorFilter(e.target.value)}
                aria-label="Filter by Color"
                className="h-9 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Colors</option>
                {filterOptions.colors.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 4. Inventory Material Requirement Table (Section 5, 6, 7, 8, 9, 10, 33, 34) */}
        {filteredRows.length === 0 ? (
          <Card className="border-slate-200 bg-white py-12 text-center">
            <CardContent className="space-y-3">
              <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-800 text-sm">
                  No stock requirements are available for this order.
                </h4>
                {searchQuery && (
                  <p className="text-xs text-slate-500">
                    Try clearing your search or filter options.
                  </p>
                )}
              </div>
              {searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="text-xs"
                >
                  Clear Search
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-4 w-1/4">Stock / Style</th>
                    <th className="py-3 px-4 w-1/6">Color</th>
                    <th className="py-3 px-4 w-1/4">Gram / Piece</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right w-1/5">Total Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => {
                    const rawVal = gramInputs[row.rowKey] ?? "";
                    const isMissing = !row.isConfigured;

                    return (
                      <tr
                        key={row.rowKey}
                        className={`transition-colors hover:bg-slate-50/70 ${
                          isMissing ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {/* Stock / Style */}
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 text-xs">
                            {row.displayName}
                          </p>
                        </td>

                        {/* Color */}
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {row.displayColor}
                        </td>

                        {/* Gram / Piece (Manual Input) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 max-w-[160px]">
                            <Input
                              suppressHydrationWarning
                              type="text"
                              inputMode="decimal"
                              placeholder="e.g. 250"
                              value={rawVal}
                              onChange={(e) => handleGramChange(row.rowKey, e.target.value)}
                              disabled={isLocked}
                              className={`h-8 text-xs font-mono px-2 text-slate-900 bg-white ${
                                isMissing
                                  ? "border-amber-300 focus:ring-amber-400"
                                  : "border-slate-300 focus:ring-emerald-500"
                              }`}
                            />
                            <span className="text-xs text-slate-500 font-semibold shrink-0">
                              g
                            </span>
                          </div>
                          {isMissing && (
                            <span className="text-[10px] text-status-warning block mt-0.5 font-medium">
                              Gram / Piece required
                            </span>
                          )}
                        </td>

                        {/* Quantity (Automatic strictly from Stock Sizes) */}
                        <td className="py-3 px-4 text-right">
                          <p className="font-bold text-slate-900 text-xs">
                            {row.quantity.toLocaleString()} pieces
                          </p>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            From Stock Sizes
                          </span>
                        </td>

                        {/* Total Weight */}
                        <td className="py-3 px-4 text-right">
                          {row.isConfigured ? (
                            <>
                              <p className="font-extrabold text-evenvibe-deep text-sm">
                                {row.totalKg} kg
                              </p>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                {row.totalGrams.toLocaleString()} g
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900">
                    <td colSpan={3} className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-600">
                      TOTAL MATERIAL REQUIREMENT
                    </td>
                    <td className="py-3 px-4 text-right text-slate-900 text-xs font-bold">
                      {calculationResult.totalPieces.toLocaleString()} pieces
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-800 text-base font-extrabold">
                      {calculationResult.totalMaterialKg} kg
                      {calculationResult.totalMaterialGrams > 0 && (
                        <span className="block text-[10px] text-slate-500 font-mono font-normal">
                          ({calculationResult.totalMaterialGrams.toLocaleString()} g)
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile Stacked Cards (Section 44) */}
            <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
              {filteredRows.map((row) => {
                const rawVal = gramInputs[row.rowKey] ?? "";
                const isMissing = !row.isConfigured;

                return (
                  <div
                    key={row.rowKey}
                    className={`p-3 rounded-lg border bg-white space-y-2.5 shadow-2xs ${
                      isMissing ? "border-amber-200 bg-amber-50/20" : "border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h5 className="font-bold text-slate-900 text-sm">
                          {row.displayName}
                        </h5>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Color: <strong className="text-slate-800">{row.displayColor}</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">
                          {row.quantity} pieces
                        </span>
                        <span className="text-[10px] text-slate-400 block">From Stock Sizes</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 w-32">
                        <Input
                          suppressHydrationWarning
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 250"
                          value={rawVal}
                          onChange={(e) => handleGramChange(row.rowKey, e.target.value)}
                          disabled={isLocked}
                          className="h-8 text-xs font-mono"
                        />
                        <span className="text-xs text-slate-500 font-semibold">g</span>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-medium">Total Weight</p>
                        <p className="text-sm font-bold text-evenvibe-deep">
                          {row.isConfigured ? `${row.totalKg} kg` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-bold flex justify-between items-center text-xs text-slate-900">
                <span>TOTAL: {calculationResult.totalPieces} pieces</span>
                <span className="text-evenvibe-deep font-extrabold text-sm">
                  {calculationResult.totalMaterialKg} kg
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* 5. Warning & Action Bar (Section 16, 37, 38) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            {calculationResult.missingCount > 0 ? (
              <div className="flex items-center gap-2 text-amber-700 font-medium text-xs">
                <AlertCircle className="h-4 w-4 text-status-warning shrink-0" />
                <span>
                  Gram / Piece required for {calculationResult.missingCount} item(s) before
                  completing Inventory.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-evenvibe-deep font-medium text-xs">
                <CheckCircle2 className="h-4 w-4 text-evenvibe-primary shrink-0" />
                <span>
                  All {calculationResult.rows.length} uniform items have valid Gram / Piece values. Ready to proceed to Cutting.
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLocked}
              className="text-xs border-slate-300 hover:bg-slate-50 gap-1.5 h-9 font-semibold"
            >
              <Save className="h-3.5 w-3.5 text-slate-600" />
              {isSaving ? "Saving..." : "Save Inventory"}
            </Button>

            {isCurrentStageInventory && (
              <Button
                size="sm"
                onClick={handleCompleteInventory}
                disabled={isCompleting || isLocked || !calculationResult.allRowsConfigured}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs gap-1.5 h-9 font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="h-4 w-4" />
                {isCompleting ? "Completing..." : "Complete Inventory & Move to Cutting"}
              </Button>
            )}
          </div>
        </div>
      </div>
  );
}
