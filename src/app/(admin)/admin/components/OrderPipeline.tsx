import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PipelineStageCount } from "../types";
import { ArrowRight, Ban, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderPipelineProps {
  stages: PipelineStageCount[];
}

export default function OrderPipeline({ stages }: OrderPipelineProps) {
  // Separate active/forward lifecycle stages from cancelled
  const activeStages = stages.filter((s) => s.stage !== "cancelled");
  const cancelledStage = stages.find((s) => s.stage === "cancelled");

  const totalActiveOrders = activeStages.reduce((sum, s) => {
    return s.stage !== "delivered" ? sum + s.count : sum;
  }, 0);

  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white">
      <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg font-semibold text-slate-900">
              Order Pipeline
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Real-time progression of orders through manufacturing, inspection, and delivery lifecycle
          </CardDescription>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200/60">
            Active in Pipeline: <span className="font-bold text-slate-900">{totalActiveOrders}</span>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
          >
            View All Orders
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-5 pb-6">
        {/* Horizontal scrollable lifecycle strip on desktop, safe wrapping on mobile */}
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex items-center min-w-[760px] lg:min-w-0 justify-between gap-1 sm:gap-2">
            {activeStages.map((stage, index) => {
              const hasOrders = stage.count > 0;
              const isDelivered = stage.stage === "delivered";

              return (
                <React.Fragment key={stage.stage}>
                  <Link
                    href={`/admin/orders?status=${stage.stage}`}
                    className={cn(
                      "flex-1 min-w-[100px] flex flex-col items-center p-3 rounded-xl border transition-all text-center group",
                      hasOrders
                        ? "bg-white border-slate-300 shadow-xs hover:border-emerald-500 hover:shadow-sm"
                        : "bg-slate-50/70 border-slate-200/60 hover:bg-slate-100/70",
                      isDelivered && hasOrders && "border-emerald-200 bg-emerald-50/20"
                    )}
                  >
                    <span className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-800 transition-colors truncate w-full">
                      {stage.label}
                    </span>

                    <span
                      className={cn(
                        "text-xl sm:text-2xl font-extrabold mt-1 tracking-tight",
                        hasOrders ? "text-slate-900" : "text-slate-400",
                        isDelivered && hasOrders && "text-emerald-700"
                      )}
                    >
                      {stage.count}
                    </span>

                    <span
                      className={cn(
                        "mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
                        hasOrders
                          ? stage.colorClass
                          : "bg-slate-100 text-slate-400 border border-slate-200"
                      )}
                    >
                      {hasOrders ? `${stage.count} ${stage.count === 1 ? "order" : "orders"}` : "0 orders"}
                    </span>
                  </Link>

                  {index < activeStages.length - 1 && (
                    <div className="shrink-0 text-slate-300 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Bottom banner for Cancelled orders */}
        {cancelledStage && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Ban className="w-3.5 h-3.5 text-slate-400" />
                Cancelled Orders:
              </span>
              <span className="font-semibold text-slate-900">
                {cancelledStage.count}
              </span>
            </div>
            {cancelledStage.count > 0 && (
              <Link
                href="/admin/orders?status=cancelled"
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                View Cancelled Orders
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
