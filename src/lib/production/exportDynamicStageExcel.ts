import * as XLSX from "xlsx";
import { DynamicStageCalculationResult } from "./dynamicStageEngine";

export interface ExportDynamicStageExcelParams {
  orderNumber: string;
  schoolName: string;
  calculationResult: DynamicStageCalculationResult;
}

export function buildDynamicStageWorkbook({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportDynamicStageExcelParams): XLSX.WorkBook {
  const {
    stageDisplayName,
    previousStageDisplayName,
    groups,
    totalInputPieces,
    totalMistakedPieces,
    totalOutputPieces,
  } = calculationResult;

  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // 1. Header Rows
  const headerData = [
    ["EVENVIBE UNIFORMS"],
    [`${stageDisplayName.toUpperCase()} PRODUCTION REPORT`],
    [],
    ["Order Number:", orderNumber || "—", "", "Report Date:", reportDate],
    ["School Name:", schoolName || "—", "", "Stage:", stageDisplayName],
    ["Previous Stage:", previousStageDisplayName || "—"],
    [], // Empty separator
    [
      "Order Number",
      "School",
      "Stage",
      "Previous Stage",
      "Item",
      "Style",
      "Color",
      "Size",
      `Input Quantity (from ${previousStageDisplayName})`,
      `Actual Mistaked ${stageDisplayName} Quantity`,
      `Result (${stageDisplayName} Output)`,
      "Status",
    ],
  ];

  // 2. Data Rows
  const dataRows: (string | number)[][] = [];

  if (groups.length === 0) {
    dataRows.push([
      orderNumber || "—",
      schoolName || "—",
      stageDisplayName,
      previousStageDisplayName || "—",
      "No dynamic stage items available.",
      "—",
      "—",
      "—",
      0,
      0,
      0,
      "No Data",
    ]);
  } else {
    groups.forEach((group) => {
      const displayItem = group.itemName;
      const displayStyle = group.styleName || "Standard";
      const displayColor = group.color || "Standard";

      group.sizeRows.forEach((row) => {
        let statusText = "Pending";
        if (row.mistakedQuantity !== null) {
          if (row.mistakedQuantity === 0) {
            statusText = "Completed (0 Mistake)";
          } else {
            statusText = `Completed (${row.mistakedQuantity} Mistake)`;
          }
        }

        dataRows.push([
          orderNumber || "—",
          schoolName || "—",
          stageDisplayName,
          previousStageDisplayName || "—",
          displayItem,
          displayStyle,
          displayColor,
          row.size,
          row.inputQuantity,
          row.mistakedQuantity !== null ? row.mistakedQuantity : "—",
          row.outputQuantity !== null ? row.outputQuantity : "—",
          statusText,
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
    "",
    "",
    totalInputPieces,
    totalMistakedPieces !== null ? totalMistakedPieces : 0,
    totalOutputPieces !== null ? totalOutputPieces : totalInputPieces,
    totalInputPieces === totalOutputPieces ? "Completed (No Loss)" : "Completed",
  ];

  const fullSheetData = [...headerData, ...dataRows, [], footerRow];

  // 4. Create Worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Column formatting
  worksheet["!cols"] = [
    { wch: 16 }, // Order Number
    { wch: 28 }, // School
    { wch: 18 }, // Stage
    { wch: 18 }, // Previous Stage
    { wch: 22 }, // Item
    { wch: 22 }, // Style
    { wch: 18 }, // Color
    { wch: 12 }, // Size
    { wch: 16 }, // Input Quantity
    { wch: 34 }, // Actual Mistaked [Stage] Quantity
    { wch: 14 }, // Result
    { wch: 22 }, // Status
  ];

  const sanitizedStage = stageDisplayName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizedStage);

  return workbook;
}

export function exportDynamicStageExcel({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportDynamicStageExcelParams): void {
  const workbook = buildDynamicStageWorkbook({
    orderNumber,
    schoolName,
    calculationResult,
  });

  const sanitizedOrderNumber = (orderNumber || "ORDER").replace(/[^a-zA-Z0-9-_]/g, "_");
  const sanitizedStageName = calculationResult.stageDisplayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
  const filename = `${sanitizedOrderNumber}_${sanitizedStageName}_report.xlsx`;

  XLSX.writeFile(workbook, filename);
}
