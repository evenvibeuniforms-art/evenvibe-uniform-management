"use client";

import React from "react";
import { CheckingCalculationResult } from "@/lib/production/checkingEngine";
import { OrderWorkflowStage, formatWorkflowStageLabel } from "@/lib/productionWorkflow";

interface CheckingPrintViewProps {
  orderNumber: string;
  schoolName: string;
  calculationResult: CheckingCalculationResult;
  workflows?: OrderWorkflowStage[] | null;
}

export default function CheckingPrintView({
  orderNumber,
  schoolName,
  calculationResult,
  workflows,
}: CheckingPrintViewProps) {
  const {
    finalDynamicStageDisplayName,
    groups,
    totalInputPieces,
    totalPassedPieces,
    totalRejectPieces,
  } = calculationResult;

  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const sortedWorkflows = [...(workflows || [])].sort((a, b) => a.sequence_order - b.sequence_order);

  return (
    <div className="w-full text-black bg-white font-sans print:block leading-normal p-6">
      {/* 1. Header Information */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
              EVENVIBE UNIFORMS
            </h1>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700 mt-1">
              STAGE 7 — QUALITY CHECKING REPORT
            </h2>
          </div>
          <div className="text-right text-xs space-y-1">
            <p suppressHydrationWarning>
              <span className="font-semibold text-slate-600">Date:</span>{" "}
              <span className="font-bold text-slate-900">{printDate}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-300 text-xs">
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
              Source Stage
            </span>
            <span className="font-bold text-slate-900 text-sm">{finalDynamicStageDisplayName}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Current Stage
            </span>
            <span className="font-bold text-slate-900 text-sm">Checking (Stage 7)</span>
          </div>
        </div>
      </div>

      {/* 2. Production Flow Banner */}
      {sortedWorkflows.length > 0 && (
        <div className="mb-6 p-3 bg-slate-50 border border-slate-300 rounded text-xs">
          <div className="font-bold uppercase tracking-wider text-[10px] text-slate-600 mb-2">
            Order Manufacturing Sequence (8 Stages)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortedWorkflows.map((w, idx) => (
              <React.Fragment key={w.stage_key}>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    w.stage_key === "checking"
                      ? "bg-evenvibe-deep text-white font-bold"
                      : w.status === "completed"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {idx + 1}. {formatWorkflowStageLabel(w.stage_key)}
                  {w.status === "completed" ? " ✓" : ""}
                </span>
                {idx < sortedWorkflows.length - 1 && (
                  <span className="text-slate-400 font-bold">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* 3. Executive Metrics: Input, Passed, Reject */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-center">
        <div className="p-3 border border-slate-300 rounded bg-slate-50">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
            Total Input Pieces
          </span>
          <span className="text-xl font-black text-slate-900">{totalInputPieces}</span>
        </div>
        <div className="p-3 border border-slate-300 rounded bg-evenvibe-light">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
            Total Passed Pieces
          </span>
          <span className="text-xl font-black text-emerald-900">{totalPassedPieces}</span>
        </div>
        <div className="p-3 border border-slate-300 rounded bg-rose-50">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
            Total Reject Pieces
          </span>
          <span className="text-xl font-black text-rose-900">{totalRejectPieces}</span>
        </div>
      </div>

      {/* 4. Production Tables by Group */}
      {groups.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-slate-300 rounded text-slate-500 text-sm">
          No pieces are available for checking.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.groupKey} className="border border-slate-400 rounded overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-sm text-slate-900">{group.itemName}</span>
                  <span className="text-slate-600 ml-2">
                    Style: <strong>{group.cleanStyleName}</strong> | Color: <strong>{group.displayColor}</strong>
                  </span>
                </div>
                <div className="text-right font-medium">
                  Input: <strong>{group.inputTotal}</strong> | Passed: <strong>{group.passedTotal ?? "—"}</strong> | Reject: <strong>{group.rejectTotal ?? "—"}</strong>
                </div>
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-[11px] uppercase tracking-wider text-slate-700">
                    <th className="py-2 px-3 font-bold border-r border-slate-200">Size</th>
                    <th className="py-2 px-3 font-bold border-r border-slate-200 text-right">
                      Input ({finalDynamicStageDisplayName})
                    </th>
                    <th className="py-2 px-3 font-bold border-r border-slate-200 text-right">
                      Passed Quantity
                    </th>
                    <th className="py-2 px-3 font-bold border-r border-slate-200 text-right">
                      Reject Quantity
                    </th>
                    <th className="py-2 px-3 font-bold border-r border-slate-200 text-center">Status</th>
                    <th className="py-2 px-3 font-bold">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {group.sizeRows.map((row) => (
                    <tr key={row.size} className="border-b border-slate-200">
                      <td className="py-2 px-3 font-bold border-r border-slate-200">{row.size}</td>
                      <td className="py-2 px-3 font-semibold text-right border-r border-slate-200">
                        {row.inputQuantity}
                      </td>
                      <td className="py-2 px-3 font-semibold text-right border-r border-slate-200 text-emerald-800">
                        {row.passedQuantity !== null ? row.passedQuantity : "—"}
                      </td>
                      <td className="py-2 px-3 font-semibold text-right border-r border-slate-200 text-rose-800">
                        {row.rejectQuantity !== null ? row.rejectQuantity : "—"}
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-200">
                        <span
                          className={`font-semibold ${
                            row.isComplete ? "text-evenvibe-deep" : "text-amber-700"
                          }`}
                        >
                          {row.statusText}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{row.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* 5. Quality Inspector Sign-off Section */}
      <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
        <div>
          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-8">
            Quality Checking Inspector
          </p>
          <div className="border-b border-slate-400 w-48 mb-1" />
          <p className="text-slate-500">Signature & Date</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-8">
            Production Supervisor
          </p>
          <div className="border-b border-slate-400 w-48 ml-auto mb-1" />
          <p className="text-slate-500">Verified & Approved</p>
        </div>
      </div>
    </div>
  );
}
