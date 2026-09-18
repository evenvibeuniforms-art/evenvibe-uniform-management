import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QualityCheckOverviewData } from "../types";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Clock } from "lucide-react";

interface QualityCheckOverviewProps {
  data: QualityCheckOverviewData;
}

export default function QualityCheckOverview({ data }: QualityCheckOverviewProps) {
  const totalQC = data.pending + data.in_progress + data.passed + data.failed;

  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Quality Check
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Garment inspections & pass/fail auditing
            </CardDescription>
          </div>
          <Link
            href="/admin/quality-check"
            className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-0.5 hover:underline"
          >
            Details
            <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Pending */}
            <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200/60">
              <div className="flex items-center gap-1.5 text-xs text-purple-800 font-medium">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                Pending
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {data.pending}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Awaiting review
              </div>
            </div>

            {/* In Progress */}
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200/60">
              <div className="flex items-center gap-1.5 text-xs text-blue-800 font-medium">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                In Progress
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {data.in_progress}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Under inspection
              </div>
            </div>

            {/* Passed */}
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/60">
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Passed
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {data.passed}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Verified batches
              </div>
            </div>

            {/* Failed */}
            <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200/60">
              <div className="flex items-center gap-1.5 text-xs text-rose-800 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Failed
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {data.failed}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Rework needed
              </div>
            </div>
          </div>

          {totalQC === 0 && (
            <div className="text-center text-xs text-slate-500 py-1">
              No quality checks pending.
            </div>
          )}
        </CardContent>
      </div>

      <div className="p-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs">
        <span className="text-slate-500">Total QC records: {totalQC}</span>
        <Link
          href="/admin/quality-check"
          className="text-purple-700 font-medium hover:underline inline-flex items-center gap-1"
        >
          Open QC Module
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}
