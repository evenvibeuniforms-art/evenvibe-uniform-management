"use client";

import React from "react";
import { DynamicStageCalculationResult } from "@/lib/production/dynamicStageEngine";
import { OrderWorkflowStage, STAGE_CONFIG_MAP, formatWorkflowStageLabel } from "@/lib/productionWorkflow";

interface DynamicStagePrintViewProps {
  orderNumber: string;
  schoolName: string;
  calculationResult: DynamicStageCalculationResult;
  workflows?: OrderWorkflowStage[] | null;
}

export default function DynamicStagePrintView({
  orderNumber,
  schoolName,
  calculationResult,
  workflows,
}: DynamicStagePrintViewProps) {
  const {
    stageDisplayName,
    previousStageDisplayName,
    groups,
    totalInputPieces,
    totalMistakedPieces,
    totalOutputPieces,
    allRequiredSizesEntered,
    missingSizesCount,
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
              {stageDisplayName.toUpperCase()} PRODUCTION REPORT
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
              Previous Stage
            </span>
            <span className="font-bold text-slate-900 text-sm">{previousStageDisplayName}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Active Stage
            </span>
            <span className="font-bold text-slate-900 text-sm">{stageDisplayName}</span>
          </div>
        </div>
      </div>

      {/* 2. Production Flow Banner */}
      {sortedWorkflows.length > 0 && (
        <div className="mb-6 p-3 bg-slate-50 border border-slate-300 rounded text-xs">
          <span className="font-bold text-slate-700 uppercase tracking-wider block mb-1 text-[10px]">
            Saved Order Production Flow (Strict Sequence)
          </span>
          <div className="flex flex-wrap items-center gap-1.5 text-slate-800 font-medium">
            {sortedWorkflows.map((w, idx) => {
              const isCurrent = w.stage_key === calculationResult.stageKey;
              const isPrev = w.stage_key === calculationResult.previousStageKey;
              return (
                <React.Fragment key={w.stage_key}>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      isCurrent
                        ? "bg-evenvibe-primary text-white border-evenvibe-deep"
                        : isPrev
                        ? "bg-slate-200 text-slate-800 border-slate-300"
                        : "bg-white text-slate-700 border-slate-200"
                    }`}
                  >
                    {idx + 1}. {STAGE_CONFIG_MAP[w.stage_key]?.label || formatWorkflowStageLabel(w.stage_key)}
                  </span>
                  {idx < sortedWorkflows.length - 1 && (
                    <span className="text-slate-400 font-bold">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. KPI Summary Bar */}
      <div className="grid grid-cols-4 gap-3 mb-6 bg-slate-50 border border-slate-300 p-3 rounded text-center">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Total Input Pieces (from {previousStageDisplayName})
          </span>
          <span className="text-lg font-black text-slate-900">{totalInputPieces}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Total Actual Mistaked {stageDisplayName}
          </span>
          <span className="text-lg font-black text-amber-900">{totalMistakedPieces}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Total Output Pieces (to Next Stage)
          </span>
          <span className="text-lg font-black text-evenvibe-deep">{totalOutputPieces}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block">
            Stage Completion
          </span>
          <span className="text-lg font-black text-emerald-800">
            {allRequiredSizesEntered ? "Ready" : `${missingSizesCount} Pending`}
          </span>
        </div>
      </div>

      {/* 4. Style & Color Grouped Tables */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.groupKey} className="border border-slate-400 rounded overflow-hidden">
            {/* Group Header */}
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-300 flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-900 text-sm uppercase">{group.itemName}</span>
                <span className="mx-2 text-slate-400">|</span>
                <span className="text-slate-700">Style: <strong>{group.cleanStyleName}</strong></span>
                <span className="mx-2 text-slate-400">|</span>
                <span className="text-slate-700">Color: <strong>{group.displayColor}</strong></span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600">
                Input: {group.inputTotal} | Mistaked: {group.mistakedTotal} | Output: {group.outputTotal}
              </div>
            </div>

            {/* Table with 3 sections represented in columns */}
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="py-2 px-3 border-r border-slate-200">Size</th>
                  <th className="py-2 px-3 border-r border-slate-200 bg-slate-100/60 font-bold">
                    Section 1: Input from {previousStageDisplayName.toUpperCase()} {previousStageDisplayName === "Cutting" ? "(Actual Cut Output)" : ""}
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 font-bold">
                    Section 2: Actual Mistaked {stageDisplayName} Quantity
                  </th>
                  <th className="py-2 px-3 border-r border-slate-200 font-bold">
                    Section 3: Result / Output (Input - Mistaked)
                  </th>
                  <th className="py-2 px-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {group.sizeRows.map((row) => (
                  <tr key={row.rowKey} className="hover:bg-slate-50/50">
                    <td className="py-1.5 px-3 font-bold text-slate-900 border-r border-slate-200">
                      {row.size}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-200 bg-slate-50/30 font-medium">
                      {row.inputQuantity} {row.inputQuantity === 1 ? "piece" : "pieces"}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                      {row.mistakedQuantity !== null ? row.mistakedQuantity : "—"}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-evenvibe-deep">
                      {row.outputQuantity !== null ? row.outputQuantity : "—"}
                    </td>
                    <td className="py-1.5 px-3 font-semibold text-[11px]">
                      {row.statusText}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300">
                  <td className="py-2 px-3 border-r border-slate-200 uppercase text-[10px]">Group Total</td>
                  <td className="py-2 px-3 border-r border-slate-200">{group.inputTotal}</td>
                  <td className="py-2 px-3 border-r border-slate-200 text-amber-900">{group.mistakedTotal}</td>
                  <td className="py-2 px-3 border-r border-slate-200 text-evenvibe-deep">{group.outputTotal}</td>
                  <td className="py-2 px-3">
                    {group.allSizesEntered ? "Complete" : "In Progress"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>

      {/* 5. Signatures Footer */}
      <div className="grid grid-cols-3 gap-6 mt-12 pt-6 border-t border-slate-400 text-xs text-center">
        <div>
          <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
          <span className="font-semibold text-slate-700">Production Supervisor</span>
        </div>
        <div>
          <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
          <span className="font-semibold text-slate-700">Quality Checker</span>
        </div>
        <div>
          <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
          <span className="font-semibold text-slate-700">Factory Manager</span>
        </div>
      </div>
    </div>
  );
}
