"use client";

import React from "react";
import { CuttingCalculationResult } from "@/lib/production/cuttingCalculations";

interface CuttingPrintViewProps {
  orderNumber: string;
  schoolName: string;
  calculationResult: CuttingCalculationResult;
}

export default function CuttingPrintView({
  orderNumber,
  schoolName,
  calculationResult,
}: CuttingPrintViewProps) {
  const { groups, totalRequiredPieces, totalCutPieces, totalPendingPieces, totalExtraCutPieces } =
    calculationResult;

  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="w-full text-black bg-white font-sans print:block leading-normal">
      {/* 1. Header Information (Section 12) */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
              EVENVIBE UNIFORMS
            </h1>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700 mt-1">
              CUTTING REQUIREMENT REPORT
            </h2>
          </div>
          <div className="text-right text-xs space-y-1">
            <p suppressHydrationWarning>
              <span className="font-semibold text-slate-600">Date:</span>{" "}
              <span className="font-bold text-slate-900">{printDate}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-slate-300 text-xs">
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Order Number
            </span>
            <span className="font-bold text-slate-900 text-sm">{orderNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              School
            </span>
            <span className="font-bold text-slate-900 text-sm">{schoolName || "—"}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Total Students
            </span>
            <span className="font-bold text-slate-900 text-sm">
              {(calculationResult.totalStudents || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Class-Wise Students in this Order */}
      {calculationResult.classSummaries && calculationResult.classSummaries.length > 0 && (
        <div className="mb-6 p-3 border border-slate-300 rounded-sm bg-slate-50 page-break-inside-avoid">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Class-Wise Students in this Order ({calculationResult.totalStudents} total students across {calculationResult.classSummaries.length} classes)
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
            {calculationResult.classSummaries.map((cs) => (
              <div key={cs.className} className="bg-white p-2 border border-slate-200 rounded flex justify-between items-center">
                <span className="font-semibold text-slate-700">{cs.className}</span>
                <span className="font-bold text-slate-900">{cs.studentCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Style + Color Separate Sections (Section 12, 14, 21) */}
      <div className="space-y-6">
        {groups.length === 0 ? (
          <div className="text-center py-12 border border-slate-300 rounded-sm text-slate-600 text-sm font-medium">
            No cutting requirements are available for this order.
          </div>
        ) : (
          groups.map((group) => (
          <div
            key={group.groupKey}
            className="page-break-inside-avoid border border-slate-400 rounded-sm overflow-hidden mb-6"
          >
            {/* Section Header: Item, Style & Color */}
            <div className="bg-slate-100 border-b border-slate-400 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-black text-slate-900 text-sm tracking-wide">
                  {group.displayName}
                </span>
                <span className="ml-4 font-semibold text-slate-700">
                  Color: <strong className="text-slate-900 font-extrabold">{group.displayColor}</strong>
                </span>
              </div>
              <div className="flex gap-4 text-xs font-medium text-slate-700">
                <span>
                  Required: <strong>{group.requiredTotal}</strong>
                </span>
                <span>
                  Cut: <strong>{group.cutTotal}</strong>
                </span>
                <span>
                  Pending: <strong>{group.pendingTotal}</strong>
                </span>
                <span>
                  Extra Cut: <strong>{group.extraCutTotal}</strong>
                </span>
              </div>
            </div>

            {/* Table with real HTML elements, selectable text, and repeating headers */}
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-300 text-[11px] uppercase tracking-wider">
                  <th className="py-2 px-4 border-r border-slate-300 w-24">Size</th>
                  <th className="py-2 px-4 border-r border-slate-300 text-right w-28">Required</th>
                  <th className="py-2 px-4 border-r border-slate-300 text-right w-28">Cut</th>
                  <th className="py-2 px-4 border-r border-slate-300 text-right w-28">Result</th>
                  <th className="py-2 px-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {group.sizeRows.map((row) => (
                  <tr key={row.rowKey} className="border-b border-slate-200 break-inside-avoid">
                    <td className="py-2 px-4 border-r border-slate-300 font-bold text-slate-900">
                      {row.size}
                    </td>
                    <td className="py-2 px-4 border-r border-slate-300 text-right font-medium text-slate-900">
                      {row.required}
                    </td>
                    <td className="py-2 px-4 border-r border-slate-300 text-right font-medium text-slate-900">
                      {row.cut !== null ? row.cut : "—"}
                    </td>
                    <td className="py-2 px-4 border-r border-slate-300 text-right font-mono font-bold text-slate-900">
                      {row.resultDisplay}
                    </td>
                    <td className="py-2 px-4 text-left font-semibold text-slate-800">
                      {row.statusText}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/70 font-bold text-slate-800 border-t border-slate-300 text-xs">
                  <td className="py-2 px-4 border-r border-slate-300 uppercase text-[10px] text-slate-600">
                    Section Total
                  </td>
                  <td className="py-2 px-4 border-r border-slate-300 text-right">
                    {group.requiredTotal}
                  </td>
                  <td className="py-2 px-4 border-r border-slate-300 text-right">
                    {group.cutTotal}
                  </td>
                  <td className="py-2 px-4 border-r border-slate-300 text-right font-mono">
                    {group.pendingTotal > 0 || group.extraCutTotal > 0 ? (
                      <span>
                        {group.extraCutTotal > 0 ? `+${group.extraCutTotal} ` : ""}
                        {group.pendingTotal > 0 ? `-${group.pendingTotal}` : ""}
                      </span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="py-2 px-4 text-left">
                    {group.pendingTotal === 0 && group.extraCutTotal === 0 && group.allSizesEntered
                      ? "Complete"
                      : [
                          group.extraCutTotal > 0 ? `${group.extraCutTotal} Extra Cut` : null,
                          group.pendingTotal > 0 ? `${group.pendingTotal} Pending` : null,
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )))}
      </div>

      {/* 3. Dedicated Overall Summary Section (Section 12) */}
      <div className="mt-8 pt-4 border-t-2 border-slate-900 page-break-inside-avoid">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 mb-3">
          SUMMARY
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 border-2 border-slate-900 bg-slate-50 text-xs font-bold">
          <div>
            <span className="uppercase text-slate-600 text-[10px] tracking-wider block">
              Total Students:
            </span>
            <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
              {(calculationResult.totalStudents || 0).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="uppercase text-slate-600 text-[10px] tracking-wider block">
              Total Required:
            </span>
            <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
              {totalRequiredPieces.toLocaleString()} pieces
            </span>
          </div>
          <div>
            <span className="uppercase text-slate-600 text-[10px] tracking-wider block">
              Total Cut:
            </span>
            <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
              {totalCutPieces.toLocaleString()} pieces
            </span>
          </div>
          <div>
            <span className="uppercase text-amber-800 text-[10px] tracking-wider block">
              Total Pending:
            </span>
            <span className="text-base font-extrabold text-amber-900 mt-0.5 block">
              {totalPendingPieces.toLocaleString()} pieces
            </span>
          </div>
          <div>
            <span className="uppercase text-evenvibe-deep text-[10px] tracking-wider block">
              Total Extra Cut:
            </span>
            <span className="text-base font-extrabold text-evenvibe-deep mt-0.5 block">
              {totalExtraCutPieces.toLocaleString()} pieces
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
