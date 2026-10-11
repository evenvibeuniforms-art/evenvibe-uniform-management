"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight, PackagePlus, PackageMinus, CheckCircle2 } from "lucide-react";

export interface ExtraShortItemRow {
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  originalQuantity: number;
  actualQuantity: number;
  difference: number;
  classification: "exact" | "extra" | "short" | "not_delivered";
}

interface AdminDeliveryExtraShortViewProps {
  items: ExtraShortItemRow[];
  summary: {
    totalOriginal: number;
    totalActual: number;
    totalExtra: number;
    totalShort: number;
    totalNotDelivered: number;
  };
  onPrintReport: () => void;
  onOpenFollowupModal: (preselectedItems?: ExtraShortItemRow[]) => void;
}

export function AdminDeliveryExtraShortView({
  items,
  summary,
  onPrintReport,
  onOpenFollowupModal,
}: AdminDeliveryExtraShortViewProps) {
  const extraItems = items.filter((it) => it.difference > 0);
  const shortItems = items.filter((it) => it.difference < 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Extra & Short Delivery Tracking
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit surplus items delivered and pending items that require follow-up dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrintReport}
            className="text-xs gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print Extra / Short Report
          </Button>

          {shortItems.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenFollowupModal(shortItems)}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Plan Follow-up Dispatch ({summary.totalShort} pcs)
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards Row (No Netting!) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-bold text-slate-500">
              Total Ordered
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {summary.totalOriginal}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Confirmed order quantity
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-bold text-slate-500">
              Actual Delivered
            </CardDescription>
            <CardTitle className="text-2xl font-black text-evenvibe-deep dark:text-emerald-400">
              {summary.totalActual}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Physical pieces sent
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-blue-700 dark:text-blue-300">
                Extra Pieces
              </CardDescription>
              <PackagePlus className="w-4 h-4 text-blue-600" />
            </div>
            <CardTitle className="text-2xl font-black text-blue-700 dark:text-blue-300">
              +{summary.totalExtra}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-blue-600 dark:text-blue-400">
            Sent above ordered quantity
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-amber-700 dark:text-amber-300">
                Short / Pending
              </CardDescription>
              <PackageMinus className="w-4 h-4 text-amber-600" />
            </div>
            <CardTitle className="text-2xl font-black text-amber-700 dark:text-amber-300">
              {summary.totalShort > 0 ? `-${summary.totalShort}` : "0"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-amber-600 dark:text-amber-400">
            Pieces needing follow-up
          </CardContent>
        </Card>
      </div>

      {/* 1. EXTRA DELIVERY SECTION */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-blue-600" />
                Extra Delivery Items ({extraItems.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Physical garments sent in excess of the original order quantity.
              </CardDescription>
            </div>
            <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-bold text-xs px-2.5 py-0.5">
              +{summary.totalExtra} Extra Pcs
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {extraItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No extra delivery quantities for this order.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-2.5 px-4">Style</th>
                    <th className="py-2.5 px-4">Item</th>
                    <th className="py-2.5 px-4">Color</th>
                    <th className="py-2.5 px-4 text-center">Size</th>
                    <th className="py-2.5 px-4 text-center">Ordered</th>
                    <th className="py-2.5 px-4 text-center">Delivered</th>
                    <th className="py-2.5 px-4 text-center">Extra Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {extraItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">{item.styleName}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{item.itemName}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{item.color}</td>
                      <td className="py-3 px-4 text-center font-bold">Size {item.size}</td>
                      <td className="py-3 px-4 text-center text-slate-500">{item.originalQuantity}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900">{item.actualQuantity}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                          +{item.difference} pcs
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. SHORT DELIVERY & PENDING SECTION */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PackageMinus className="w-4 h-4 text-amber-600" />
                Short & Pending Delivery Items ({shortItems.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Garments that were ordered but were not sent or partially sent in this consignment.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-xs px-2.5 py-0.5">
                -{summary.totalShort + summary.totalNotDelivered} Short Pcs
              </Badge>
              {shortItems.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenFollowupModal(shortItems)}
                  className="text-xs h-7 gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
                >
                  <ArrowRight className="w-3 h-3" />
                  Plan Follow-up
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {shortItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <span>No short quantities! Full order delivered.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-2.5 px-4">Style</th>
                    <th className="py-2.5 px-4">Item</th>
                    <th className="py-2.5 px-4">Color</th>
                    <th className="py-2.5 px-4 text-center">Size</th>
                    <th className="py-2.5 px-4 text-center">Ordered</th>
                    <th className="py-2.5 px-4 text-center">Delivered</th>
                    <th className="py-2.5 px-4 text-center">Short Quantity</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {shortItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">{item.styleName}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{item.itemName}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{item.color}</td>
                      <td className="py-3 px-4 text-center font-bold">Size {item.size}</td>
                      <td className="py-3 px-4 text-center text-slate-700 font-semibold">{item.originalQuantity}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900">{item.actualQuantity}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-xs border border-amber-200">
                          {item.difference} pcs
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.actualQuantity === 0 ? (
                          <Badge variant="destructive" className="text-[10px] py-0 px-2">
                            Not Delivered
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] py-0 px-2">
                            Short Delivery
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
