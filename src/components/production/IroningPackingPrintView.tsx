"use client";

import React from "react";
import {
  IroningCalculationResult,
  PackingCalculationResult,
} from "@/lib/production/ironingPackingEngine";

interface IroningPackingPrintViewProps {
  orderNumber: string;
  schoolName: string;
  mode: "ironing" | "packing" | "combined";
  ironingResult: IroningCalculationResult;
  packingResult?: PackingCalculationResult;
}

export default function IroningPackingPrintView({
  orderNumber,
  schoolName,
  mode,
  ironingResult,
  packingResult,
}: IroningPackingPrintViewProps) {
  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const showIroning = mode === "ironing" || mode === "combined";
  const showPacking = (mode === "packing" || mode === "combined") && packingResult && !packingResult.isLocked;

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
              {mode === "ironing"
                ? "STAGE 8 — IRONING REPORT"
                : mode === "packing"
                ? "STAGE 8 — PACKING REPORT"
                : "STAGE 8 — IRONING & PACKING COMPLETE REPORT"}
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
            <span className="font-bold text-slate-900 text-sm">#{orderNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              School
            </span>
            <span className="font-semibold text-slate-900">{schoolName || "—"}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Production Stage
            </span>
            <span className="font-semibold text-slate-900">Stage 8 — Ironing & Packing</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600 uppercase text-[10px] tracking-wider block">
              Total Input Units
            </span>
            <span className="font-semibold text-slate-900">
              {ironingResult.totalInputPieces} pieces
            </span>
          </div>
        </div>
      </div>

      {/* 2. SECTION A: IRONING */}
      {showIroning && (
        <div className="mb-8">
          <div className="flex items-center justify-between border-b border-slate-400 pb-2 mb-3">
            <h3 className="font-black text-sm uppercase tracking-wider text-slate-900">
              SECTION 1: IRONING OPERATION (Checking Passed → Ironed)
            </h3>
            <span className="text-xs font-semibold text-slate-700">
              Total Input: {ironingResult.totalInputPieces} | Ironed: {ironingResult.totalIronedPieces} | Pending: {ironingResult.totalPendingPieces}
            </span>
          </div>

          {ironingResult.groups.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-300 rounded text-center text-xs text-slate-600">
              No pieces are available for ironing.
            </div>
          ) : (
            ironingResult.groups.map((grp) => (
              <div key={grp.groupKey} className="mb-4">
                <div className="bg-slate-100 px-3 py-1.5 border border-slate-300 font-bold text-xs flex justify-between">
                  <span>
                    {grp.itemName} — Style: {grp.styleName || "Standard"} (Color: {grp.color || "Standard"})
                  </span>
                  <span>
                    Input: {grp.totalInput} | Ironed: {grp.totalActual} | Pending: {grp.totalPending}
                  </span>
                </div>
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700">
                      <th className="border border-slate-300 px-3 py-1.5 text-left font-bold">Size</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Input from Checking</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Ironed Quantity</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Pending</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-center font-bold">Status</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-left font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grp.sizeRows.map((row) => (
                      <tr key={row.rowKey} className="border-b border-slate-200">
                        <td className="border border-slate-300 px-3 py-1 font-semibold">{row.size}</td>
                        <td className="border border-slate-300 px-3 py-1 text-right">{row.inputQuantity}</td>
                        <td className="border border-slate-300 px-3 py-1 text-right font-bold">
                          {row.actualQuantity !== null ? row.actualQuantity : "—"}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-right">
                          {row.pendingQuantity !== null ? row.pendingQuantity : "—"}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-center font-semibold">
                          {row.statusText}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-slate-600">
                          {row.remarks || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. SECTION B: PACKING */}
      {showPacking && packingResult && (
        <div className="mb-8">
          <div className="flex items-center justify-between border-b border-slate-400 pb-2 mb-3">
            <h3 className="font-black text-sm uppercase tracking-wider text-slate-900">
              SECTION 2: PACKING OPERATION (Ironed Output → Packed)
            </h3>
            <span className="text-xs font-semibold text-slate-700">
              Total Input: {packingResult.totalInputPieces} | Packed: {packingResult.totalPackedPieces} | Pending: {packingResult.totalPendingPieces}
            </span>
          </div>

          {packingResult.groups.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-300 rounded text-center text-xs text-slate-600">
              No pieces are available for packing.
            </div>
          ) : (
            packingResult.groups.map((grp) => (
              <div key={grp.groupKey} className="mb-4">
                <div className="bg-slate-100 px-3 py-1.5 border border-slate-300 font-bold text-xs flex justify-between">
                  <span>
                    {grp.itemName} — Style: {grp.styleName || "Standard"} (Color: {grp.color || "Standard"})
                  </span>
                  <span>
                    Input: {grp.totalInput} | Packed: {grp.totalActual} | Pending: {grp.totalPending}
                  </span>
                </div>
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700">
                      <th className="border border-slate-300 px-3 py-1.5 text-left font-bold">Size</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Input from Ironing</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Packed Quantity</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-right font-bold">Pending</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-center font-bold">Status</th>
                      <th className="border border-slate-300 px-3 py-1.5 text-left font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grp.sizeRows.map((row) => (
                      <tr key={row.rowKey} className="border-b border-slate-200">
                        <td className="border border-slate-300 px-3 py-1 font-semibold">{row.size}</td>
                        <td className="border border-slate-300 px-3 py-1 text-right">{row.inputQuantity}</td>
                        <td className="border border-slate-300 px-3 py-1 text-right font-bold">
                          {row.actualQuantity !== null ? row.actualQuantity : "—"}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-right">
                          {row.pendingQuantity !== null ? row.pendingQuantity : "—"}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-center font-semibold">
                          {row.statusText}
                        </td>
                        <td className="border border-slate-300 px-3 py-1 text-slate-600">
                          {row.remarks || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Final Sign-off block */}
      <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
        <div>
          <p className="font-bold text-slate-700">Ironing Supervisor Signature:</p>
          <div className="mt-8 border-b border-slate-400 w-48"></div>
        </div>
        <div>
          <p className="font-bold text-slate-700">Packing & Dispatch Supervisor Signature:</p>
          <div className="mt-8 border-b border-slate-400 w-48"></div>
        </div>
      </div>
    </div>
  );
}
