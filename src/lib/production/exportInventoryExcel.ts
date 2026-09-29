import * as XLSX from "xlsx";
import { InventoryCalculationResult } from "./inventoryCalculations";

export interface ExportInventoryExcelParams {
  orderNumber: string;
  schoolName: string;
  calculationResult: InventoryCalculationResult;
}

export function buildInventoryWorkbook({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportInventoryExcelParams): XLSX.WorkBook {
  const { rows, totalPieces, totalMaterialGrams, totalMaterialKg } = calculationResult;

  // Header metadata rows
  const headerData = [
    ["EVENVIBE UNIFORM MANAGEMENT"],
    ["INVENTORY MATERIAL REQUIREMENT REPORT"],
    ["Order Number:", orderNumber],
    ["School Name:", schoolName || "—"],
    ["Report Date:", new Date().toLocaleDateString("en-IN")],
    [], // empty row separator
    [
      "Order Number",
      "School",
      "Item",
      "Style",
      "Color",
      "Gram / Piece (g)",
      "Quantity",
      "Total Weight (g)",
      "Total Weight (kg)",
    ],
  ];

  // Data rows
  const dataRows = rows.map((r) => [
    orderNumber,
    schoolName || "—",
    r.itemName,
    r.cleanStyleName || "—",
    r.displayColor,
    r.gramPerPiece !== null ? r.gramPerPiece : "Required",
    r.quantity,
    r.isConfigured ? r.totalGrams : "—",
    r.isConfigured ? r.totalKg : "—",
  ]);

  // Total summary footer row
  const footerRow = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    totalPieces,
    totalMaterialGrams,
    totalMaterialKg,
  ];

  const fullSheetData = [...headerData, ...dataRows, [], footerRow];

  // Create worksheet and workbook
  const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Set column widths for clean readability
  worksheet["!cols"] = [
    { wch: 22 }, // Order Number
    { wch: 28 }, // School
    { wch: 18 }, // Item
    { wch: 18 }, // Style
    { wch: 16 }, // Color
    { wch: 18 }, // Gram / Piece
    { wch: 12 }, // Quantity
    { wch: 16 }, // Total Weight (g)
    { wch: 18 }, // Total Weight (kg)
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Requirement");
  return workbook;
}

export function exportInventoryExcel({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportInventoryExcelParams): void {
  const workbook = buildInventoryWorkbook({ orderNumber, schoolName, calculationResult });

  // Generate file download
  const cleanOrderNumber = orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `EVENVIBE-Inventory-${cleanOrderNumber}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}
