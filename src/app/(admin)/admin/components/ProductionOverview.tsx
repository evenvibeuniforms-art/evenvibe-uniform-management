import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductionOverviewData } from "../types";
import { ArrowRight, CheckCircle2, Clock, Factory } from "lucide-react";

interface ProductionOverviewProps {
  data: ProductionOverviewData;
}

export default function ProductionOverview({ data }: ProductionOverviewProps) {
  const completionPercentage =
    data.totalQuantity > 0
      ? Math.round((data.completedQuantity / data.totalQuantity) * 100)
      : 0;

  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Production Overview
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Manufacturing queue & fulfillment units
            </CardDescription>
          </div>
          <Link
            href="/admin/production"
            className="text-xs font-medium text-amber-600 hover:text-amber-700 flex items-center gap-0.5 hover:underline"
          >
            Details
            <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {data.productionOrdersCount === 0 && data.totalQuantity === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No production orders currently.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/60">
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    Active Orders
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {data.productionOrdersCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    In manufacturing
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Completed
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {data.completedProductionCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Batches finished
                  </div>
                </div>
              </div>

              {/* Progress & Quantities */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Quantity Progress</span>
                  <span className="font-semibold text-slate-800">
                    {data.completedQuantity} / {data.totalQuantity} pcs ({completionPercentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                  <span>Pending Units: <strong className="text-slate-800">{data.pendingQuantity} pcs</strong></span>
                  <span>Total Target: <strong className="text-slate-800">{data.totalQuantity} pcs</strong></span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </div>

      <div className="p-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs">
        <span className="text-slate-500">View manufacturing floor</span>
        <Link
          href="/admin/production"
          className="text-amber-700 font-medium hover:underline inline-flex items-center gap-1"
        >
          Open Production
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}
