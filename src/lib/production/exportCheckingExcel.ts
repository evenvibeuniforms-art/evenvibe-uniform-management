import * as XLSX from "xlsx";
import { CheckingCalculationResult } from "./checkingEngine";

export interface ExportCheckingExcelParams {
  orderNumber: string;
  schoolName: string;
  calculationResult: CheckingCalculationResult;
}

export function buildCheckingWorkbook(params: ExportCheckingExcelParams): XLSX.WorkBook {
  const {
    orderNumber,
    schoolName,
    calculationResult,
  } = params;

  const {
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

  // 1. Header Information
  const headerData = [
    ["EVENVIBE UNIFORMS"],
    ["STAGE 7 — QUALITY CHECKING REPORT"],
    [],
    ["Order Number:", orderNumber || "—", "", "Date:", printDate],
    ["School Name:", schoolName || "—"],
    [], // Blank line before table
    [
      "Order Number",
      "School",
      "Item",
      "Style",
      "Color",
      "Size",
      "Input Quantity",
      "Passed Quantity",
      "Reject Quantity",
      "Status",
      "Remarks / Defect Reason",
    ],
  ];

  // 2. Data Rows
  const dataRows: (string | number)[][] = [];

  if (groups.length === 0) {
    dataRows.push([
      orderNumber || "—",
      schoolName || "—",
      "No checking stage data available.",
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
    groups.forEach((group) => {
      const displayItem = group.itemName;
      const displayStyle = group.styleName || "Standard";
      const displayColor = group.color || "Standard";

      group.sizeRows.forEach((row) => {
        let statusDisplay = "Pending";
        if (row.status === "complete") {
          statusDisplay = "Complete";
        } else if (row.status === "invalid") {
          statusDisplay = "Invalid Quantities";
        } else if (row.status === "incomplete") {
          statusDisplay = "Incomplete";
        }

        dataRows.push([
          orderNumber || "—",
          schoolName || "—",
          displayItem,
          displayStyle,
          displayColor,
          row.size,
          row.inputQuantity,
          row.passedQuantity !== null ? row.passedQuantity : "—",
          row.rejectQuantity !== null ? row.rejectQuantity : "—",
          statusDisplay,
          row.remarks || "—",
        ]);
      });
    });
  }

  // 3. Summary Footer Row
  const footerRow = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    totalInputPieces,
    totalPassedPieces,
    totalRejectPieces,
    totalInputPieces === totalPassedPieces + totalRejectPieces ? "Completed" : "Pending",
    "",
  ];

  const fullSheetData = [...headerData, ...dataRows, [], footerRow];

  // 4. Create Workbook and Worksheet
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Set clean column widths
  ws["!cols"] = [
    { wch: 18 }, // Order Number
    { wch: 26 }, // School
    { wch: 18 }, // Item
    { wch: 20 }, // Style
    { wch: 16 }, // Color
    { wch: 10 }, // Size
    { wch: 22 }, // Input Quantity
    { wch: 16 }, // Passed Quantity
    { wch: 16 }, // Reject Quantity
    { wch: 14 }, // Status
    { wch: 28 }, // Remarks
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Checking Report");
  return wb;
}

export function exportCheckingExcel(params: ExportCheckingExcelParams): void {
  const wb = buildCheckingWorkbook(params);
  const cleanOrderNum = (params.orderNumber || "order").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Checking_Stage_Order_${cleanOrderNum}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
