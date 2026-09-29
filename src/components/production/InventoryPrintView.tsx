"use client";

import React from "react";
import { InventoryCalculationResult } from "@/lib/production/inventoryCalculations";

interface InventoryPrintViewProps {
  orderNumber: string;
  schoolName: string;
  calculationResult: InventoryCalculationResult;
}

export default function InventoryPrintView({
  orderNumber,
  schoolName,
  calculationResult,
}: InventoryPrintViewProps) {
  const { rows, totalPieces, totalMaterialKg, totalMaterialGrams } = calculationResult;
  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="w-full text-black bg-white font-sans print:block">
      {/* Print Document Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
              EVENVIBE UNIFORMS
            </h1>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 mt-1">
              INVENTORY MATERIAL REQUIREMENT
            </h2>
          </div>
          <div className="text-right text-xs space-y-1">
            <p suppressHydrationWarning>
              <span className="font-semibold text-slate-600">Date:</span> {printDate}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-300 text-xs">
          <div>
            <span className="font-semibold text-slate-600">Order Number:</span>{" "}
            <span className="font-bold text-slate-900">{orderNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-600">School:</span>{" "}
            <span className="font-bold text-slate-900">{schoolName || "—"}</span>
          </div>
        </div>
      </div>

      {/* Material Requirement Table */}
      <table className="w-full text-left text-xs border-collapse border border-slate-400">
        <thead>
          <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-400">
            <th className="py-2.5 px-3 border-r border-slate-300">Stock / Style</th>
            <th className="py-2.5 px-3 border-r border-slate-300">Color</th>
            <th className="py-2.5 px-3 border-r border-slate-300 text-right">Gram / Piece</th>
            <th className="py-2.5 px-3 border-r border-slate-300 text-right">Quantity</th>
            <th className="py-2.5 px-3 text-right">Total Weight</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-300">
          {rows.map((row, idx) => (
            <tr key={`${row.rowKey}-${idx}`} className="page-break-inside-avoid border-b border-slate-200">
              <td className="py-2 px-3 border-r border-slate-300 font-semibold text-slate-900">
                {row.displayName}
              </td>
              <td className="py-2 px-3 border-r border-slate-300 text-slate-800">
                {row.displayColor}
              </td>
              <td className="py-2 px-3 border-r border-slate-300 text-right text-slate-800 font-mono">
                {row.gramPerPiece !== null ? `${row.gramPerPiece} g` : "—"}
              </td>
              <td className="py-2 px-3 border-r border-slate-300 text-right font-bold text-slate-900">
                {row.quantity}
              </td>
              <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                {row.isConfigured ? `${row.totalKg} kg` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="mt-6 p-4 border-2 border-slate-900 bg-slate-50 flex justify-between items-center text-xs font-bold page-break-inside-avoid">
        <div>
          <span className="uppercase text-slate-700">TOTAL PIECES:</span>{" "}
          <span className="text-base font-extrabold text-slate-900 ml-1">
            {totalPieces}
          </span>
        </div>
        <div>
          <span className="uppercase text-slate-700">TOTAL MATERIAL:</span>{" "}
          <span className="text-base font-extrabold text-slate-900 ml-1">
            {totalMaterialKg} KG
          </span>
          <span className="text-[11px] text-slate-600 font-normal ml-1">
            ({totalMaterialGrams.toLocaleString()} g)
          </span>
        </div>
      </div>
    </div>
  );
}
