"use client";

import React from "react";
import {
  OrderDeliveryReturn,
  OrderFollowupDispatch,
} from "@/types/database";

export type PrintableDocumentType =
  | { type: "delivery_sheet" }
  | { type: "extra_short_report" }
  | { type: "return_note"; record: OrderDeliveryReturn }
  | { type: "followup_dispatch"; dispatch: OrderFollowupDispatch }
  | { type: "style_delivery_sheet"; styleName: string; batchNumber?: number; batchReference?: string };

interface AdminDeliveryPrintDocumentsProps {
  document: PrintableDocumentType | null;
  orderNumber: string;
  schoolName: string;
  courierName?: string | null;
  trackingNumber?: string | null;
  estimatedDelivery?: string | null;
  actualItems: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    originalQuantity: number;
    actualQuantity: number;
    difference: number;
    classification: "exact" | "extra" | "short" | "not_delivered";
  }>;
  summary: {
    totalOriginal: number;
    totalActual: number;
    totalExtra: number;
    totalShort: number;
    totalNotDelivered: number;
  };
  hasUnsavedChanges?: boolean;
}

export function AdminDeliveryPrintDocuments({
  document,
  orderNumber,
  schoolName,
  courierName,
  trackingNumber,
  estimatedDelivery,
  actualItems,
  summary,
  hasUnsavedChanges = false,
}: AdminDeliveryPrintDocumentsProps) {
  if (!document) return null;

  const todayStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div id="delivery-print-root" className="hidden print:block print:p-6 print:text-black print:bg-white text-xs">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          #delivery-print-root,
          #delivery-print-root * {
            visibility: visible !important;
          }
          #delivery-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
            color: black !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* 1. DELIVERY SHEET */}
      {document.type === "delivery_sheet" && (
        <div className="space-y-4">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
                EVENVIBE UNIFORMS & APPAREL
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                Official Consignment Delivery Sheet
              </p>
            </div>
            <div className="text-right text-[11px] space-y-0.5">
              <p>
                <span className="font-semibold text-slate-600">Print Date:</span> {todayStr}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Order Ref:</span> #{orderNumber}
              </p>
            </div>
          </div>

          {hasUnsavedChanges && (
            <div className="p-2 border border-amber-500 bg-amber-50 text-amber-900 font-bold text-center text-xs">
              ⚠️ Note: Unsaved on-screen edits are present. This sheet reflects currently saved database records.
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-3 border border-slate-300 rounded bg-slate-50/50 text-xs">
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Recipient School</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">{schoolName}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Order Number</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">#{orderNumber}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Courier / Partner</p>
              <p className="font-semibold text-slate-900 mt-0.5">{courierName || "Direct Handover"}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Tracking Number / Est. Delivery</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {trackingNumber ? `Track: ${trackingNumber}` : "Direct Dispatch"}
                {estimatedDelivery ? ` (Est: ${estimatedDelivery})` : ""}
              </p>
            </div>
          </div>

          {/* Delivery Items Matrix Table */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800 uppercase text-[10px] tracking-wider">
                  <th className="p-2 border-r border-slate-300">Style</th>
                  <th className="p-2 border-r border-slate-300">Item</th>
                  <th className="p-2 border-r border-slate-300">Color</th>
                  <th className="p-2 border-r border-slate-300 text-center">Size</th>
                  <th className="p-2 border-r border-slate-300 text-right">Original Qty</th>
                  <th className="p-2 border-r border-slate-300 text-right">Actual Qty</th>
                  <th className="p-2 border-r border-slate-300 text-center">Diff</th>
                  <th className="p-2 text-center">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {actualItems.map((item, idx) => {
                  const diffStr =
                    item.difference > 0
                      ? `+${item.difference}`
                      : item.difference < 0
                      ? `${item.difference}`
                      : "0";

                  const classLabel =
                    item.classification === "exact"
                      ? "Exact"
                      : item.classification === "extra"
                      ? "Extra Delivery"
                      : item.classification === "short"
                      ? "Short Delivery"
                      : "Not Delivered";

                  return (
                    <tr key={idx} className="print-break-inside-avoid">
                      <td className="p-2 font-semibold border-r border-slate-200">{item.styleName}</td>
                      <td className="p-2 border-r border-slate-200">{item.itemName}</td>
                      <td className="p-2 border-r border-slate-200">{item.color}</td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold">Size {item.size}</td>
                      <td className="p-2 border-r border-slate-200 text-right font-medium">{item.originalQuantity}</td>
                      <td className="p-2 border-r border-slate-200 text-right font-bold text-slate-900">
                        {item.actualQuantity}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold">{diffStr}</td>
                      <td className="p-2 text-center font-semibold text-[11px]">{classLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="print-break-inside-avoid border-2 border-slate-800 rounded p-3 bg-slate-50 space-y-2">
            <h3 className="font-bold uppercase text-[11px] tracking-wider text-slate-900">
              Delivery Piece Reconciliation Summary
            </h3>
            <div className="grid grid-cols-5 gap-2 text-center pt-1 border-t border-slate-300">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Original Pieces</span>
                <span className="text-base font-black text-slate-900">{summary.totalOriginal}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Actual Delivered</span>
                <span className="text-base font-black text-slate-950">{summary.totalActual}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Extra Pieces</span>
                <span className="text-base font-black text-blue-800">+{summary.totalExtra}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Short Pieces</span>
                <span className="text-base font-black text-amber-800">
                  {summary.totalShort > 0 ? `-${summary.totalShort}` : "0"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Not Delivered</span>
                <span className="text-base font-black text-rose-800">
                  {summary.totalNotDelivered > 0 ? `-${summary.totalNotDelivered}` : "0"}
                </span>
              </div>
            </div>
          </div>

          {/* Handover Signatures */}
          <div className="print-break-inside-avoid pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Dispatched By (EvenVibe Admin):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Date</p>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Received & Verified By (School Representative):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Name, Signature & Stamp</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. EXTRA & SHORT DELIVERY REPORT */}
      {document.type === "extra_short_report" && (
        <div className="space-y-4">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
                EVENVIBE UNIFORMS & APPAREL
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                Extra & Short Delivery Discrepancy Report
              </p>
            </div>
            <div className="text-right text-[11px] space-y-0.5">
              <p>
                <span className="font-semibold text-slate-600">Date:</span> {todayStr}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Order Ref:</span> #{orderNumber}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 border border-slate-300 rounded bg-slate-50/50 text-xs">
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">School Name</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">{schoolName}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Order Number</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">#{orderNumber}</p>
            </div>
          </div>

          {/* Section: Extra Deliveries */}
          <div className="space-y-1.5 print-break-inside-avoid">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center justify-between">
              <span>1. Extra Delivery Items (Surplus Sent Above Ordered Qty)</span>
              <span>Total Extra: +{summary.totalExtra} pcs</span>
            </h2>
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-blue-50 border-b border-slate-300 font-bold text-slate-800 text-[10px] uppercase">
                    <th className="p-2 border-r border-slate-300">Style</th>
                    <th className="p-2 border-r border-slate-300">Item</th>
                    <th className="p-2 border-r border-slate-300">Color</th>
                    <th className="p-2 border-r border-slate-300 text-center">Size</th>
                    <th className="p-2 border-r border-slate-300 text-right">Ordered</th>
                    <th className="p-2 border-r border-slate-300 text-right">Actual Delivered</th>
                    <th className="p-2 text-center">Extra Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {actualItems
                    .filter((it) => it.difference > 0)
                    .map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold border-r border-slate-200">{item.styleName}</td>
                        <td className="p-2 border-r border-slate-200">{item.itemName}</td>
                        <td className="p-2 border-r border-slate-200">{item.color}</td>
                        <td className="p-2 border-r border-slate-200 text-center font-bold">Size {item.size}</td>
                        <td className="p-2 border-r border-slate-200 text-right">{item.originalQuantity}</td>
                        <td className="p-2 border-r border-slate-200 text-right font-bold">{item.actualQuantity}</td>
                        <td className="p-2 text-center font-black text-blue-800">+{item.difference}</td>
                      </tr>
                    ))}
                  {actualItems.filter((it) => it.difference > 0).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-3 text-center text-slate-500 italic">
                        No extra quantities for this delivery.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Short Deliveries & Not Delivered */}
          <div className="space-y-1.5 print-break-inside-avoid pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center justify-between">
              <span>2. Short & Pending Delivery Items (Ordered Pieces Not Sent)</span>
              <span>Total Short / Pending: -{summary.totalShort + summary.totalNotDelivered} pcs</span>
            </h2>
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-amber-50 border-b border-slate-300 font-bold text-slate-800 text-[10px] uppercase">
                    <th className="p-2 border-r border-slate-300">Style</th>
                    <th className="p-2 border-r border-slate-300">Item</th>
                    <th className="p-2 border-r border-slate-300">Color</th>
                    <th className="p-2 border-r border-slate-300 text-center">Size</th>
                    <th className="p-2 border-r border-slate-300 text-right">Ordered</th>
                    <th className="p-2 border-r border-slate-300 text-right">Delivered</th>
                    <th className="p-2 border-r border-slate-300 text-center">Short Qty</th>
                    <th className="p-2 text-center">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {actualItems
                    .filter((it) => it.difference < 0)
                    .map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold border-r border-slate-200">{item.styleName}</td>
                        <td className="p-2 border-r border-slate-200">{item.itemName}</td>
                        <td className="p-2 border-r border-slate-200">{item.color}</td>
                        <td className="p-2 border-r border-slate-200 text-center font-bold">Size {item.size}</td>
                        <td className="p-2 border-r border-slate-200 text-right">{item.originalQuantity}</td>
                        <td className="p-2 border-r border-slate-200 text-right font-bold">{item.actualQuantity}</td>
                        <td className="p-2 border-r border-slate-200 text-center font-black text-amber-900">
                          {item.difference}
                        </td>
                        <td className="p-2 text-center font-semibold text-[11px]">
                          {item.actualQuantity === 0 ? "Not Delivered" : "Short Delivery"}
                        </td>
                      </tr>
                    ))}
                  {actualItems.filter((it) => it.difference < 0).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-3 text-center text-slate-500 italic">
                        No short quantities. All ordered items delivered in full.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Resolution Signatures */}
          <div className="print-break-inside-avoid pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Report Compiled By (EvenVibe):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Date</p>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Acknowledged By (School Authority):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Official Stamp</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. RETURN / SEND-BACK NOTE */}
      {document.type === "return_note" && (
        <div className="space-y-4">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
                EVENVIBE UNIFORMS & APPAREL
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                Item Return / Send-Back to School Note
              </p>
            </div>
            <div className="text-right text-[11px] space-y-0.5">
              <p>
                <span className="font-semibold text-slate-600">Note Date:</span> {todayStr}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Return ID:</span> #{document.record.id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 border border-slate-300 rounded bg-slate-50/50 text-xs">
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">School Name</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">{schoolName}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Original Order Ref</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">#{orderNumber}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Return Status</p>
              <p className="font-bold text-slate-900 uppercase mt-0.5">{document.record.status}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Created Date / Dispatch Date</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {new Date(document.record.created_at).toLocaleDateString("en-IN")}
                {document.record.dispatch_date ? ` (Dispatched: ${document.record.dispatch_date})` : ""}
              </p>
            </div>
          </div>

          {/* Return Item Details */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800 uppercase text-[10px]">
                  <th className="p-2 border-r border-slate-300">Style</th>
                  <th className="p-2 border-r border-slate-300">Item</th>
                  <th className="p-2 border-r border-slate-300">Color</th>
                  <th className="p-2 border-r border-slate-300 text-center">Size</th>
                  <th className="p-2 text-right">Return Quantity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2.5 font-bold border-r border-slate-200">{document.record.style_name}</td>
                  <td className="p-2.5 border-r border-slate-200">{document.record.item_name}</td>
                  <td className="p-2.5 border-r border-slate-200">{document.record.color}</td>
                  <td className="p-2.5 border-r border-slate-200 text-center font-bold">
                    Size {document.record.size}
                  </td>
                  <td className="p-2.5 text-right font-black text-sm text-slate-950">
                    {document.record.quantity} pcs
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reason & Remarks Box */}
          <div className="p-3 border border-slate-300 rounded space-y-2 bg-slate-50/40 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-600 block">Reason for Return / Discrepancy:</span>
              <p className="font-semibold text-slate-900 mt-0.5">{document.record.reason}</p>
            </div>
            {document.record.tracking_details && (
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Tracking / Reference Details:</span>
                <p className="font-medium text-slate-800 mt-0.5">{document.record.tracking_details}</p>
              </div>
            )}
            {document.record.remarks && (
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Remarks:</span>
                <p className="text-slate-700 mt-0.5">{document.record.remarks}</p>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="print-break-inside-avoid pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Processed By (EvenVibe Admin):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Date</p>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Received By (School Representative):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Date</p>
            </div>
          </div>
        </div>
      )}

      {/* 4. FOLLOW-UP DISPATCH SHEET */}
      {document.type === "followup_dispatch" && (
        <div className="space-y-4">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
                EVENVIBE UNIFORMS & APPAREL
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                Follow-up Consignment Dispatch Sheet
              </p>
            </div>
            <div className="text-right text-[11px] space-y-0.5">
              <p>
                <span className="font-semibold text-slate-600">Dispatch Date:</span> {document.dispatch.dispatch_date}
              </p>
              <p>
                <span className="font-semibold text-slate-600">Ref #:</span> {document.dispatch.dispatch_reference}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 border border-slate-300 rounded bg-slate-50/50 text-xs">
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Recipient School</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">{schoolName}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Original Order Number</p>
              <p className="text-sm font-bold text-slate-950 mt-0.5">#{orderNumber}</p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Courier / Delivery Partner</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {document.dispatch.courier_name || "Direct Transport"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 font-semibold uppercase text-[10px]">Tracking Number / Status</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {document.dispatch.tracking_number ? `Track: ${document.dispatch.tracking_number} ` : ""}
                <span className="uppercase text-[11px] font-bold">({document.dispatch.status})</span>
              </p>
            </div>
          </div>

          {/* Follow-up Items Table */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800 uppercase text-[10px]">
                  <th className="p-2 border-r border-slate-300">Style</th>
                  <th className="p-2 border-r border-slate-300">Item</th>
                  <th className="p-2 border-r border-slate-300">Color</th>
                  <th className="p-2 border-r border-slate-300 text-center">Size</th>
                  <th className="p-2 text-right">Dispatch Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(document.dispatch.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-semibold border-r border-slate-200">{it.style_name}</td>
                    <td className="p-2 border-r border-slate-200">{it.item_name}</td>
                    <td className="p-2 border-r border-slate-200">{it.color}</td>
                    <td className="p-2 border-r border-slate-200 text-center font-bold">Size {it.size}</td>
                    <td className="p-2 text-right font-bold text-slate-950">{it.quantity} pcs</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                  <td colSpan={4} className="p-2 text-right uppercase text-[11px] border-r border-slate-300">
                    Total Follow-up Pieces:
                  </td>
                  <td className="p-2 text-right text-sm font-black text-slate-950">
                    {(document.dispatch.items || []).reduce((acc, it) => acc + it.quantity, 0)} pcs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {document.dispatch.remarks && (
            <div className="p-3 border border-slate-300 rounded bg-slate-50/40 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-600 block">Dispatch Remarks:</span>
              <p className="text-slate-800 mt-0.5">{document.dispatch.remarks}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="print-break-inside-avoid pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Dispatched By (EvenVibe):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Signature & Date</p>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-800">Received By (School Representative):</p>
              <div className="border-b border-slate-400 w-3/4"></div>
              <p className="text-[11px] text-slate-500">Name, Signature & Stamp</p>
            </div>
          </div>
        </div>
      )}

      {/* 5. STYLE-WISE DELIVERY SHEET */}
      {document.type === "style_delivery_sheet" && (() => {
        const styleItems = actualItems.filter(
          (it) => it.styleName.trim().toLowerCase() === document.styleName.trim().toLowerCase()
        );

        let styleOrig = 0;
        let styleAct = 0;
        let styleExtra = 0;
        let styleShort = 0;
        let styleNotDelivered = 0;

        // Group by Item -> Color -> Sizes
        const itemMap: Record<
          string,
          Record<
            string,
            Array<{
              size: string;
              orig: number;
              act: number;
              diff: number;
              classification: "exact" | "extra" | "short" | "not_delivered";
            }>
          >
        > = {};

        for (const it of styleItems) {
          styleOrig += it.originalQuantity;
          styleAct += it.actualQuantity;
          if (it.difference > 0) {
            styleExtra += it.difference;
          } else if (it.difference < 0) {
            if (it.actualQuantity === 0 && it.originalQuantity > 0) {
              styleNotDelivered += it.originalQuantity;
              styleShort += it.originalQuantity;
            } else {
              styleShort += it.originalQuantity - it.actualQuantity;
            }
          }

          if (!itemMap[it.itemName]) itemMap[it.itemName] = {};
          if (!itemMap[it.itemName][it.color]) itemMap[it.itemName][it.color] = [];

          itemMap[it.itemName][it.color].push({
            size: it.size,
            orig: it.originalQuantity,
            act: it.actualQuantity,
            diff: it.difference,
            classification: it.classification,
          });
        }

        // Sort sizes ascending numerically for each color
        for (const itName of Object.keys(itemMap)) {
          for (const clName of Object.keys(itemMap[itName])) {
            itemMap[itName][clName].sort((a, b) => {
              const numA = parseInt(a.size, 10);
              const numB = parseInt(b.size, 10);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.size.localeCompare(b.size);
            });
          }
        }

        return (
          <div className="space-y-4">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">
                  EVENVIBE UNIFORMS & APPAREL
                </h1>
                <p className="text-xs font-bold text-slate-700 tracking-wide mt-0.5">
                  Consignment Delivery Breakdown — Style Report
                </p>
              </div>
              <div className="text-right text-[11px] space-y-0.5">
                <p>
                  <span className="font-semibold text-slate-600">Print Date:</span> {todayStr}
                </p>
                <p>
                  <span className="font-semibold text-slate-600">Order Ref:</span> #{orderNumber}
                </p>
                {document.batchReference && (
                  <p>
                    <span className="font-semibold text-slate-600">Delivery Batch:</span> {document.batchReference}
                  </p>
                )}
              </div>
            </div>

            {hasUnsavedChanges && (
              <div className="p-2 border border-amber-500 bg-amber-50 text-amber-900 font-bold text-center text-xs">
                ⚠️ Note: Unsaved on-screen edits are present. This sheet reflects currently saved database records.
              </div>
            )}

            {/* Recipient & Consignment Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 border border-slate-300 rounded bg-slate-50/50 text-xs">
              <div>
                <p className="text-slate-500 font-semibold uppercase text-[10px]">Recipient School</p>
                <p className="text-sm font-bold text-slate-950 mt-0.5">{schoolName}</p>
              </div>
              <div>
                <p className="text-slate-500 font-semibold uppercase text-[10px]">Style & Design Label</p>
                <p className="text-sm font-bold text-slate-950 mt-0.5">{document.styleName}</p>
                <p className="text-[10px] text-slate-500">Uniform Style Design</p>
              </div>
              <div>
                <p className="text-slate-500 font-semibold uppercase text-[10px]">Courier / Partner</p>
                <p className="font-semibold text-slate-900 mt-0.5">{courierName || "Direct Handover"}</p>
              </div>
              <div>
                <p className="text-slate-500 font-semibold uppercase text-[10px]">Tracking Number</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {trackingNumber || "Direct Dispatch"}
                  {estimatedDelivery ? ` (Est: ${estimatedDelivery})` : ""}
                </p>
              </div>
            </div>

            {/* Style Matrix Groups */}
            <div className="space-y-4">
              {Object.entries(itemMap).map(([itName, colors]) => (
                <div key={itName} className="border border-slate-300 rounded overflow-hidden">
                  <div className="bg-slate-100 p-2 border-b border-slate-300 flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                      Item: {itName}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Style: {document.styleName}
                    </span>
                  </div>

                  <div className="p-3 space-y-4">
                    {Object.entries(colors).map(([colorName, sizeList]) => {
                      const colorOrig = sizeList.reduce((acc, s) => acc + s.orig, 0);
                      const colorAct = sizeList.reduce((acc, s) => acc + s.act, 0);

                      return (
                        <div key={colorName} className="space-y-1.5 print-break-inside-avoid">
                          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200">
                            <span className="font-bold text-slate-900">
                              Color: <span className="text-blue-800">{colorName}</span>
                            </span>
                            <span className="text-[11px] text-slate-600">
                              Original: <strong>{colorOrig}</strong> | Delivered: <strong>{colorAct}</strong> pcs
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-center border-collapse text-xs border border-slate-300">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-300 font-bold text-[10px] text-slate-700">
                                  <th className="p-1.5 text-left border-r border-slate-300 w-36">Size</th>
                                  {sizeList.map((s) => (
                                    <th key={s.size} className="p-1.5 border-r border-slate-300">
                                      {s.size}
                                    </th>
                                  ))}
                                  <th className="p-1.5 bg-slate-100 font-black">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-200">
                                  <th className="p-1.5 text-left font-bold text-[11px] text-slate-600 border-r border-slate-300">
                                    Original Order Quantity
                                  </th>
                                  {sizeList.map((s) => (
                                    <td key={s.size} className="p-1.5 border-r border-slate-300">
                                      {s.orig}
                                    </td>
                                  ))}
                                  <td className="p-1.5 font-bold bg-slate-50">{colorOrig}</td>
                                </tr>
                                <tr className="border-b border-slate-200 font-bold bg-emerald-50/20">
                                  <th className="p-1.5 text-left text-[11px] text-slate-900 border-r border-slate-300">
                                    Actual Delivery Quantity
                                  </th>
                                  {sizeList.map((s) => (
                                    <td key={s.size} className="p-1.5 border-r border-slate-300 font-black">
                                      {s.act}
                                    </td>
                                  ))}
                                  <td className="p-1.5 font-black text-slate-950 bg-emerald-50/40">
                                    {colorAct}
                                  </td>
                                </tr>
                                <tr className="border-b border-slate-200 text-[11px]">
                                  <th className="p-1.5 text-left font-bold text-slate-600 border-r border-slate-300">
                                    Difference (Actual - Orig)
                                  </th>
                                  {sizeList.map((s) => {
                                    const diff = s.diff;
                                    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
                                    return (
                                      <td key={s.size} className="p-1.5 border-r border-slate-300 font-bold">
                                        {diffStr}
                                      </td>
                                    );
                                  })}
                                  <td className="p-1.5 font-bold">
                                    {colorAct - colorOrig > 0
                                      ? `+${colorAct - colorOrig}`
                                      : `${colorAct - colorOrig}`}
                                  </td>
                                </tr>
                                <tr className="text-[10px]">
                                  <th className="p-1.5 text-left font-bold text-slate-600 border-r border-slate-300">
                                    Classification
                                  </th>
                                  {sizeList.map((s) => {
                                    const label =
                                      s.classification === "exact"
                                        ? "Exact"
                                        : s.classification === "extra"
                                        ? "Extra"
                                        : s.classification === "short"
                                        ? "Short"
                                        : "Not Deliv.";
                                    return (
                                      <td key={s.size} className="p-1.5 border-r border-slate-300 uppercase font-semibold text-[10px]">
                                        {label}
                                      </td>
                                    );
                                  })}
                                  <td className="p-1.5 font-semibold text-slate-400">—</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Style Totals Summary */}
            <div className="print-break-inside-avoid border-2 border-slate-800 rounded p-3 bg-slate-50 space-y-2">
              <h3 className="font-bold uppercase text-[11px] tracking-wider text-slate-900">
                Style Piece Reconciliation Summary: {document.styleName}
              </h3>
              <div className="grid grid-cols-5 gap-2 text-center pt-1 border-t border-slate-300">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Original Pieces</span>
                  <span className="text-base font-black text-slate-900">{styleOrig}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Actual Delivered</span>
                  <span className="text-base font-black text-slate-950">{styleAct}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Extra Pieces</span>
                  <span className="text-base font-black text-blue-800">+{styleExtra}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Short Pieces</span>
                  <span className="text-base font-black text-amber-800">
                    {styleShort > 0 ? `-${styleShort}` : "0"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Not Delivered</span>
                  <span className="text-base font-black text-rose-800">
                    {styleNotDelivered > 0 ? `-${styleNotDelivered}` : "0"}
                  </span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="print-break-inside-avoid pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-xs">
              <div className="space-y-8">
                <p className="font-bold text-slate-800">Consignor / Dispatched By:</p>
                <div className="border-b border-slate-400 w-3/4"></div>
                <p className="text-[11px] text-slate-500">EvenVibe Uniforms Authorized Signatory</p>
              </div>
              <div className="space-y-8">
                <p className="font-bold text-slate-800">Consignee / Received By:</p>
                <div className="border-b border-slate-400 w-3/4"></div>
                <p className="text-[11px] text-slate-500">{schoolName} Authorized Representative</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
