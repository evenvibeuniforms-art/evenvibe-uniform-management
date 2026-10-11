"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, AlertCircle, CheckCircle2, Shirt, Package, Layers, Printer } from "lucide-react";

export interface MatrixItem {
  id: string;
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  originalQuantity: number;
  pendingQuantity?: number;
}

export interface GroupedColorMatrix {
  colorName: string;
  sizes: Array<{
    size: string;
    originalQuantity: number;
    pendingQuantity: number;
    actualQuantityStr: string;
    actualQuantityNum: number | null;
    difference: number | null;
    classification: "exact" | "extra" | "short" | "not_delivered" | "pending";
    key: string;
  }>;
  totalOriginal: number;
  totalActual: number;
  totalRemaining: number;
  totalExtra: number;
  totalShort: number;
  totalNotDelivered: number;
}

export interface GroupedItemMatrix {
  itemName: string;
  colors: Record<string, GroupedColorMatrix>;
  totalOriginal: number;
}

export interface GroupedStyleMatrix {
  styleName: string;
  items: Record<string, GroupedItemMatrix>;
  totalOriginal: number;
}

export interface AdminDeliveryQuantityMatrixProps {
  matrixItems: MatrixItem[];
  actualQuantities: Record<string, string>;
  onQuantityChange: (key: string, val: string) => void;
  onSave?: () => Promise<void>;
  onSaveDraft?: () => Promise<void>;
  onFinalizeDelivery?: () => Promise<void>;
  isSaving: boolean;
  isFinalizing?: boolean;
  hasUnsavedChanges: boolean;
  isOrderDelivered?: boolean;
  isReadOnly?: boolean;
  batchLabel?: string;
  onPrintStyle?: (styleName: string) => void;
  onViewHistory?: () => void;
  validationErrors?: Record<string, string>;
  onFillMissingZeroes?: () => void;
}

export function AdminDeliveryQuantityMatrix({
  matrixItems,
  actualQuantities,
  onQuantityChange,
  onSave,
  onSaveDraft,
  onFinalizeDelivery,
  isSaving,
  isFinalizing = false,
  hasUnsavedChanges,
  isReadOnly = false,
  batchLabel,
  onPrintStyle,
  onViewHistory,
  validationErrors = {},
  onFillMissingZeroes,
}: AdminDeliveryQuantityMatrixProps) {
  // Group hierarchy: Style -> Item -> Color -> Sizes
  const groupedStyles = useMemo(() => {
    const stylesMap: Record<string, GroupedStyleMatrix> = {};

    for (const item of matrixItems) {
      const stName = item.styleName?.trim() || "Standard";
      const itName = item.itemName?.trim() || "Uniform Item";
      const clName = item.color?.trim() || "Default";
      const szName = item.size?.trim() || "Standard";

      if (!stylesMap[stName]) {
        stylesMap[stName] = {
          styleName: stName,
          items: {},
          totalOriginal: 0,
        };
      }

      if (!stylesMap[stName].items[itName]) {
        stylesMap[stName].items[itName] = {
          itemName: itName,
          colors: {},
          totalOriginal: 0,
        };
      }

      if (!stylesMap[stName].items[itName].colors[clName]) {
        stylesMap[stName].items[itName].colors[clName] = {
          colorName: clName,
          sizes: [],
          totalOriginal: 0,
          totalActual: 0,
          totalRemaining: 0,
          totalExtra: 0,
          totalShort: 0,
          totalNotDelivered: 0,
        };
      }

      const key = `${stName}_${itName}_${clName}_${szName}`;
      const colorGroup = stylesMap[stName].items[itName].colors[clName];

      const valStr = actualQuantities[key] ?? "";
      let valNum: number | null = null;
      let diff: number | null = null;
      let classification: "exact" | "extra" | "short" | "not_delivered" | "pending" = "pending";

      if (valStr.trim() !== "") {
        const parsed = parseInt(valStr, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          valNum = parsed;
          diff = parsed - item.originalQuantity;
          if (diff === 0) {
            classification = "exact";
          } else if (diff > 0) {
            classification = "extra";
          } else {
            // diff < 0
            classification = isReadOnly
              ? "short"
              : parsed === 0 && item.originalQuantity > 0
              ? "not_delivered"
              : "short";
          }
        }
      }

      colorGroup.sizes.push({
        size: szName,
        originalQuantity: item.originalQuantity,
        pendingQuantity: Math.max(0, item.pendingQuantity ?? Math.max(0, item.originalQuantity - (valNum || 0))),
        actualQuantityStr: valStr,
        actualQuantityNum: valNum,
        difference: diff,
        classification,
        key,
      });

      colorGroup.totalOriginal += item.originalQuantity;
      if (valNum !== null) {
        colorGroup.totalActual += valNum;
        if (diff !== null && diff > 0) {
          colorGroup.totalExtra += diff;
        } else if (diff !== null && diff < 0) {
          if (valNum === 0 && item.originalQuantity > 0) {
            colorGroup.totalNotDelivered += item.originalQuantity;
            colorGroup.totalShort += item.originalQuantity;
          } else {
            colorGroup.totalShort += item.originalQuantity - valNum;
          }
        }
      }

      stylesMap[stName].items[itName].totalOriginal += item.originalQuantity;
      stylesMap[stName].totalOriginal += item.originalQuantity;
    }

    // Compute consistent, non-contradictory totals for each color group
    for (const st of Object.values(stylesMap)) {
      for (const it of Object.values(st.items)) {
        for (const cl of Object.values(it.colors)) {
          // Color Remaining and Extra adhering strictly to:
          // Remaining = max(0, Original - Delivered)
          // Extra = max(0, Delivered - Original)
          cl.totalRemaining = Math.max(0, cl.totalOriginal - cl.totalActual);
          cl.totalExtra = Math.max(0, cl.totalActual - cl.totalOriginal);
          cl.totalShort = cl.totalRemaining;

          cl.sizes.sort((a, b) => {
            const numA = parseFloat(a.size);
            const numB = parseFloat(b.size);
            if (!isNaN(numA) && !isNaN(numB)) {
              if (numA !== numB) return numA - numB;
            }
            return a.size.localeCompare(b.size, undefined, { numeric: true, sensitivity: "base" });
          });
        }
      }
    }

    return Object.values(stylesMap);
  }, [matrixItems, actualQuantities, isReadOnly]);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-evenvibe-primary" />
            Actual Delivery Quantity Matrix
            {batchLabel && (
              <Badge variant="outline" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold ml-1">
                {batchLabel}
              </Badge>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manually enter actual delivered quantities beneath each size. Values are compared with original order.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isReadOnly ? (
            <>
              {hasUnsavedChanges ? (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 text-xs gap-1 py-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Unsaved Changes
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 text-xs gap-1 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Saved
                </Badge>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSaveDraft || onSave}
                disabled={isSaving || isFinalizing}
                className="font-medium text-xs gap-1.5 shadow-2xs border-slate-300 dark:border-slate-700"
              >
                <Save className="w-3.5 h-3.5 text-slate-500" />
                {isSaving ? "Saving..." : "Save Draft"}
              </Button>

              {onFinalizeDelivery && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onFinalizeDelivery}
                  disabled={isSaving || isFinalizing}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isFinalizing ? "Finalizing..." : "Finalize Delivery Batch"}
                </Button>
              )}

              {onFillMissingZeroes && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onFillMissingZeroes}
                  disabled={isSaving || isFinalizing}
                  className="text-xs border-slate-300 dark:border-slate-700 hover:bg-slate-100 font-medium text-slate-700 dark:text-slate-300"
                  title="Fill all empty quantity fields with 0"
                >
                  Fill Empty with 0
                </Button>
              )}
            </>
          ) : (
            onViewHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewHistory}
                className="text-xs font-semibold"
              >
                View Delivery History
              </Button>
            )
          )}
        </div>
      </div>

      {/* Validation Error Alert Banner */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 dark:bg-rose-950/40 dark:border-rose-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>{Object.keys(validationErrors).length} required delivery {Object.keys(validationErrors).length === 1 ? "field is" : "fields are"} missing or invalid.</strong> Please enter a quantity for each highlighted box, or enter 0 if none delivered.
            </span>
          </div>
          {onFillMissingZeroes && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onFillMissingZeroes}
              className="bg-white dark:bg-slate-900 border-rose-300 text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900 font-bold text-xs shrink-0"
            >
              Fill All Empty with 0
            </Button>
          )}
        </div>
      )}

      {/* Matrix Cards by Style */}
      {groupedStyles.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-slate-500">
          {isReadOnly ? "No items were delivered in this batch." : "No items found for this order."}
        </Card>
      ) : (
        groupedStyles.map((styleGroup) => (
          <Card
            key={styleGroup.styleName}
            className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
          >
            <CardHeader className="bg-slate-50/75 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Shirt className="h-5 w-5 text-evenvibe-primary" />
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Style: {styleGroup.styleName}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Uniform Style Design
                    </CardDescription>
                  </div>
                </div>

                <Badge className="bg-evenvibe-primary text-white font-bold text-xs px-2.5 py-1">
                  Ordered: {styleGroup.totalOriginal} pcs
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-6">
              {Object.values(styleGroup.items).map((itemGroup) => (
                <div key={itemGroup.itemName} className="space-y-4">
                  {/* Item Header */}
                  <div className="flex items-center justify-between border-b pb-1.5 border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-400" />
                      Item: {itemGroup.itemName}
                    </span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      Item Total: {itemGroup.totalOriginal} pcs
                    </span>
                  </div>

                  {/* Colors under Item */}
                  <div className="space-y-4 pl-0 sm:pl-2">
                    {Object.values(itemGroup.colors).map((colorGroup) => (
                      <div
                        key={colorGroup.colorName}
                        className="space-y-3 p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              Color:
                            </span>
                            <Badge
                              variant="outline"
                              className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 font-bold text-xs px-2.5 py-0.5"
                            >
                              {colorGroup.colorName}
                            </Badge>
                            <span className="text-xs text-slate-400">
                              ({colorGroup.sizes.length} {colorGroup.sizes.length === 1 ? "size" : "sizes"})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                              Original: <strong>{colorGroup.totalOriginal}</strong>
                            </span>
                            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded font-bold">
                              {isReadOnly ? "Delivered:" : "Batch Delivery:"} <strong>{colorGroup.totalActual}</strong>
                            </span>
                            {colorGroup.totalExtra > 0 && (
                              <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-bold">
                                Extra: +{colorGroup.totalExtra}
                              </span>
                            )}
                            {colorGroup.totalRemaining > 0 && (
                              <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-bold">
                                Pending: -{colorGroup.totalRemaining}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Size Matrix Table */}
                        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
                                <th
                                  scope="col"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap min-w-[170px]"
                                >
                                  Metric / Size
                                </th>
                                {colorGroup.sizes.map((s) => (
                                  <th
                                    key={s.size}
                                    scope="col"
                                    className="px-3 py-2 text-center text-xs font-black text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap min-w-[70px]"
                                  >
                                    Size {s.size}
                                  </th>
                                ))}
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-center text-xs font-black text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800 whitespace-nowrap min-w-[75px]"
                                >
                                  Total
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Row 1: Original Order Quantity (Read-only) */}
                              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
                                <th
                                  scope="row"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap"
                                >
                                  Original Order Quantity
                                </th>
                                {colorGroup.sizes.map((s) => (
                                  <td
                                    key={s.size}
                                    className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap"
                                  >
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">
                                      {s.originalQuantity}
                                    </span>
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-center font-black text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/40">
                                  {colorGroup.totalOriginal}
                                </td>
                              </tr>

                              {/* Row 2: Actual Delivery Quantity (Manual Numeric Input) */}
                              <tr className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <th
                                  scope="row"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-evenvibe-deep dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap"
                                >
                                  Actual Delivery Quantity
                                </th>
                                {colorGroup.sizes.map((s) => {
                                  const isError = Boolean(validationErrors?.[s.key]);
                                  return (
                                    <td
                                      key={s.size}
                                      className="p-1.5 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap"
                                    >
                                      <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={s.actualQuantityStr}
                                        onChange={(e) => onQuantityChange(s.key, e.target.value)}
                                        placeholder="0"
                                        disabled={isSaving || isFinalizing || isReadOnly}
                                        className={`h-8 w-16 text-center mx-auto font-bold text-xs bg-white dark:bg-slate-800 transition-colors ${
                                          isError
                                            ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-400 focus:border-rose-600 focus:ring-rose-500"
                                            : "border-slate-300 dark:border-slate-700 focus:border-evenvibe-primary focus:ring-1 focus:ring-evenvibe-primary"
                                        }`}
                                        title={
                                          isReadOnly
                                            ? "This batch is finalized and read-only to preserve delivery audit trail."
                                            : validationErrors?.[s.key] || `Size ${s.size} actual delivery quantity`
                                        }
                                      />
                                      {isError && (
                                        <span className="text-[10px] text-rose-600 font-bold block mt-0.5">Required</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2 text-center font-black text-evenvibe-deep dark:text-emerald-400 bg-emerald-50/20">
                                  {colorGroup.totalActual}
                                </td>
                              </tr>

                              {/* Row 3: Difference */}
                              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/20">
                                <th
                                  scope="row"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap"
                                >
                                  Difference ({isReadOnly ? "Batch vs Original" : "+Extra / -Short"})
                                </th>
                                {colorGroup.sizes.map((s) => {
                                  const diff = s.difference;
                                  const textClass =
                                    diff === null
                                      ? "text-slate-400"
                                      : diff === 0
                                      ? "text-slate-600 font-bold"
                                      : diff > 0
                                      ? "text-blue-700 dark:text-blue-400 font-black"
                                      : "text-amber-700 dark:text-amber-400 font-black";

                                  const displayStr =
                                    diff === null ? "—" : diff > 0 ? `+${diff}` : `${diff}`;

                                  return (
                                    <td
                                      key={s.size}
                                      className={`px-3 py-1.5 text-center text-xs ${textClass} border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap`}
                                    >
                                      {displayStr}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {colorGroup.totalActual - colorGroup.totalOriginal > 0
                                    ? `+${colorGroup.totalActual - colorGroup.totalOriginal}`
                                    : `${colorGroup.totalActual - colorGroup.totalOriginal}`}
                                </td>
                              </tr>

                              {/* Row 4: Order Pending Remaining */}
                              <tr className="border-b border-slate-100 dark:border-slate-800 bg-amber-50/20 dark:bg-amber-950/10">
                                <th
                                  scope="row"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap"
                                >
                                  Order Pending Remaining
                                </th>
                                {colorGroup.sizes.map((s) => (
                                  <td
                                    key={s.size}
                                    className="px-3 py-1.5 text-center text-xs font-bold text-amber-800 dark:text-amber-300 border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap"
                                  >
                                    {Math.max(0, s.pendingQuantity)}
                                  </td>
                                ))}
                                <td className="px-3 py-1.5 text-center text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50/40">
                                  {colorGroup.sizes.reduce((acc, s) => acc + Math.max(0, s.pendingQuantity), 0)}
                                </td>
                              </tr>

                              {/* Row 5: Classification */}
                              <tr className="bg-slate-50/40 dark:bg-slate-800/20">
                                <th
                                  scope="row"
                                  className="px-3.5 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap"
                                >
                                  Classification
                                </th>
                                {colorGroup.sizes.map((s) => {
                                  const cls = s.classification;
                                  return (
                                    <td
                                      key={s.size}
                                      className="px-2 py-1.5 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap"
                                    >
                                      {cls === "exact" && (
                                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-300 py-0 px-1.5">
                                          Exact
                                        </Badge>
                                      )}
                                      {cls === "extra" && (
                                        <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600 text-white font-bold py-0 px-1.5">
                                          Extra (+{s.difference})
                                        </Badge>
                                      )}
                                      {cls === "short" && (
                                        <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 text-white font-bold py-0 px-1.5">
                                          Short ({s.difference})
                                        </Badge>
                                      )}
                                      {cls === "not_delivered" && (
                                        <Badge className="text-[10px] bg-rose-600 hover:bg-rose-600 text-white font-bold py-0 px-1.5">
                                          Not Delivered
                                        </Badge>
                                      )}
                                      {cls === "pending" && (
                                        <span className="text-[11px] text-slate-400 italic">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-center text-xs">
                                  {colorGroup.totalExtra > 0 ? (
                                    <Badge className="text-[10px] bg-blue-600 hover:bg-blue-600 text-white font-bold py-0 px-1.5">
                                      Extra (+{colorGroup.totalExtra})
                                    </Badge>
                                  ) : colorGroup.totalRemaining > 0 ? (
                                    <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 text-white font-bold py-0 px-1.5">
                                      Short (-{colorGroup.totalRemaining})
                                    </Badge>
                                  ) : colorGroup.totalActual === colorGroup.totalOriginal && colorGroup.totalOriginal > 0 ? (
                                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-300 py-0 px-1.5">
                                      Exact
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">—</span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>

            {/* Style-Wise PDF / Print Action */}
            <div className="px-5 py-3.5 bg-slate-50/75 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Print or export delivery breakdown for <strong>{styleGroup.styleName}</strong>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPrintStyle?.(styleGroup.styleName)}
                className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:bg-slate-50 shadow-2xs font-semibold"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                PDF / Print
              </Button>
            </div>
          </Card>
        ))
      )}

      {/* Bottom Save Action */}
      {!isReadOnly ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs text-slate-500 max-w-xl">
            <strong>Save Draft</strong> safely stores entered quantities without reducing from pending totals. <strong>Finalize Delivery Batch</strong> confirms physical dispatch, updates delivered totals, and allocates pieces to students.
          </p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft || onSave}
              disabled={isSaving || isFinalizing}
              className="text-xs font-semibold gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving Draft..." : "Save Draft"}
            </Button>
            {onFinalizeDelivery && (
              <Button
                type="button"
                size="sm"
                onClick={onFinalizeDelivery}
                disabled={isSaving || isFinalizing}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isFinalizing ? "Finalizing Batch..." : "Finalize Delivery Batch"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>This delivery batch is finalized and locked for historical integrity.</span>
          {onViewHistory && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onViewHistory}
              className="text-xs bg-white dark:bg-slate-900 text-slate-700 font-semibold"
            >
              View Delivery History
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
