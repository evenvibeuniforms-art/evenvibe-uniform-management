import * as XLSX from "xlsx";
import {
  IroningCalculationResult,
  PackingCalculationResult,
  IroningPackingGroupSection,
  IroningPackingSizeRow,
} from "./ironingPackingEngine";

export interface ExportIroningExcelParams {
  orderNumber: string;
  schoolName?: string;
  ironingResult: IroningCalculationResult;
}

export interface ExportPackingExcelParams {
  orderNumber: string;
  schoolName?: string;
  packingResult: PackingCalculationResult;
}

export function buildIroningWorkbook(params: ExportIroningExcelParams): XLSX.WorkBook {
  const { orderNumber, schoolName, ironingResult } = params;
  const { groups, totalInputPieces, totalIronedPieces, totalPendingPieces } = ironingResult;

  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const headerData = [
    ["EVENVIBE UNIFORMS"],
    ["STAGE 8 — IRONING PRODUCTION REPORT"],
    [],
    ["Order Number:", orderNumber || "—", "", "Date:", printDate],
    ["School Name:", schoolName || "—"],
    [],
    [
      "Order Number",
      "School",
      "Item",
      "Style",
      "Color",
      "Size",
      "Input from Checking",
      "Ironed Quantity",
      "Pending",
      "Status",
      "Remarks",
    ],
  ];

  const dataRows: (string | number)[][] = [];

  if (groups.length === 0) {
    dataRows.push([
      orderNumber || "—",
      schoolName || "—",
      "No ironing stage data available.",
      "—",
      "—",
      "—",
      0,
      0,
      0,
      "No Data",
      "—",
    ]);
  } else {
    groups.forEach((group: IroningPackingGroupSection) => {
      const displayItem = group.itemName;
      const displayStyle = group.styleName || "Standard";
      const displayColor = group.color || "Standard";

      group.sizeRows.forEach((row: IroningPackingSizeRow) => {
        dataRows.push([
          orderNumber || "—",
          schoolName || "—",
          displayItem,
          displayStyle,
          displayColor,
          row.size,
          row.inputQuantity,
          row.actualQuantity !== null ? row.actualQuantity : "—",
          row.pendingQuantity !== null ? row.pendingQuantity : "—",
          row.statusText,
          row.remarks || "—",
        ]);
      });
    });
  }

  const summaryRows = [
    [],
    [
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      totalInputPieces,
      totalIronedPieces,
      totalPendingPieces,
      totalPendingPieces === 0 ? "Completed" : "Pending",
      "",
    ],
  ];

  const allRows = [...headerData, ...dataRows, ...summaryRows];
  const worksheet = XLSX.utils.aoa_to_sheet(allRows);

  worksheet["!cols"] = [
    { wch: 16 }, // Order Number
    { wch: 24 }, // School
    { wch: 18 }, // Item
    { wch: 18 }, // Style
    { wch: 14 }, // Color
    { wch: 10 }, // Size
    { wch: 22 }, // Input from Checking
    { wch: 18 }, // Ironed Quantity
    { wch: 12 }, // Pending
    { wch: 14 }, // Status
    { wch: 25 }, // Remarks
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ironing Report");
  return workbook;
}

export function downloadIroningExcel(params: ExportIroningExcelParams): void {
  const workbook = buildIroningWorkbook(params);
  const cleanOrder = params.orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  XLSX.writeFile(workbook, `Ironing_Stage8_Order_${cleanOrder}.xlsx`);
}

export function buildPackingWorkbook(params: ExportPackingExcelParams): XLSX.WorkBook {
  const { orderNumber, schoolName, packingResult } = params;
  const { groups, totalInputPieces, totalPackedPieces, totalPendingPieces } = packingResult;

  const printDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const headerData = [
    ["EVENVIBE UNIFORMS"],
    ["STAGE 8 — PACKING PRODUCTION REPORT"],
    [],
    ["Order Number:", orderNumber || "—", "", "Date:", printDate],
    ["School Name:", schoolName || "—"],
    [],
    [
      "Order Number",
      "School",
      "Item",
      "Style",
      "Color",
      "Size",
      "Input from Ironing",
      "Packed Quantity",
      "Pending",
      "Status",
      "Remarks",
    ],
  ];

  const dataRows: (string | number)[][] = [];

  if (groups.length === 0) {
    dataRows.push([
      orderNumber || "—",
      schoolName || "—",
      "No packing stage data available.",
      "—",
      "—",
      "—",
      0,
      0,
      0,
      "No Data",
      "—",
    ]);
  } else {
    groups.forEach((group: IroningPackingGroupSection) => {
      const displayItem = group.itemName;
      const displayStyle = group.styleName || "Standard";
      const displayColor = group.color || "Standard";

      group.sizeRows.forEach((row: IroningPackingSizeRow) => {
        dataRows.push([
          orderNumber || "—",
          schoolName || "—",
          displayItem,
          displayStyle,
          displayColor,
          row.size,
          row.inputQuantity,
          row.actualQuantity !== null ? row.actualQuantity : "—",
          row.pendingQuantity !== null ? row.pendingQuantity : "—",
          row.statusText,
          row.remarks || "—",
        ]);
      });
    });
  }

  const summaryRows = [
    [],
    [
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      totalInputPieces,
      totalPackedPieces,
      totalPendingPieces,
      totalPendingPieces === 0 ? "Completed" : "Pending",
      "",
    ],
  ];

  const allRows = [...headerData, ...dataRows, ...summaryRows];
  const worksheet = XLSX.utils.aoa_to_sheet(allRows);

  worksheet["!cols"] = [
    { wch: 16 }, // Order Number
    { wch: 24 }, // School
    { wch: 18 }, // Item
    { wch: 18 }, // Style
    { wch: 14 }, // Color
    { wch: 10 }, // Size
    { wch: 22 }, // Input from Ironing
    { wch: 18 }, // Packed Quantity
    { wch: 12 }, // Pending
    { wch: 14 }, // Status
    { wch: 25 }, // Remarks
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Packing Report");
  return workbook;
}

export function downloadPackingExcel(params: ExportPackingExcelParams): void {
  const workbook = buildPackingWorkbook(params);
  const cleanOrder = params.orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  XLSX.writeFile(workbook, `Packing_Stage8_Order_${cleanOrder}.xlsx`);
}
