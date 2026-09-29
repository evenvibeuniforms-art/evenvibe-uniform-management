import * as XLSX from "xlsx";
import { CuttingCalculationResult } from "./cuttingCalculations";

export interface ExportCuttingExcelParams {
  orderNumber: string;
  schoolName: string;
  calculationResult: CuttingCalculationResult;
}

export function buildCuttingWorkbook({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportCuttingExcelParams): XLSX.WorkBook {
  const { groups, totalRequiredPieces, totalCutPieces, totalPendingPieces, totalExtraCutPieces } =
    calculationResult;

  const reportDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Header metadata rows (Client-friendly, no internal keys or technical terms)
  const headerData = [
    ["EVENVIBE UNIFORMS"],
    ["CUTTING REQUIREMENT REPORT"],
    [],
    ["Order Number:", orderNumber, "", "Total Students:", `${calculationResult.totalStudents} students`],
    ["School Name:", schoolName || "—"],
    ["Report Date:", reportDate],
    [], // empty row separator
    [
      "Order Number",
      "School",
      "Item",
      "Style",
      "Color",
      "Size",
      "Required Quantity",
      "Cut Quantity",
      "Result",
      "Status",
    ],
  ];

  // Flatten size rows from groups preserving Style + Color separation
  const dataRows: (string | number)[][] = [];

  if (groups.length === 0) {
    dataRows.push([
      orderNumber,
      schoolName || "—",
      "No cutting requirements are available for this order.",
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
        dataRows.push([
          orderNumber,
          schoolName || "—",
          displayItem,
          displayStyle,
          displayColor,
          row.size,
          row.required,
          row.cut !== null ? row.cut : "—",
          row.resultDisplay,
          row.statusText,
        ]);
      });
    });
  }

  // Summary footer calculations
  let overallResultDisplay: string | number = 0;
  const netDiff = totalCutPieces - totalRequiredPieces;
  if (netDiff > 0) {
    overallResultDisplay = `+${netDiff}`;
  } else if (netDiff < 0) {
    overallResultDisplay = netDiff;
  }

  let overallStatusText = "Pending";
  if (totalCutPieces > 0) {
    if (totalPendingPieces === 0) {
      if (totalExtraCutPieces > 0) {
        overallStatusText = `Completed (+${totalExtraCutPieces} Extra Total)`;
      } else {
        overallStatusText = "Completed (Exact Total)";
      }
    } else {
      overallStatusText = `In Progress (${totalPendingPieces} Pending Total)`;
    }
  }

  const footerRow = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    totalRequiredPieces,
    totalCutPieces,
    overallResultDisplay,
    overallStatusText,
  ];

  const fullSheetData = [...headerData, ...dataRows, [], footerRow];

  // Create primary worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Set professional column widths
  worksheet["!cols"] = [
    { wch: 18 }, // Order Number
    { wch: 28 }, // School
    { wch: 18 }, // Item
    { wch: 18 }, // Style
    { wch: 16 }, // Color
    { wch: 10 }, // Size
    { wch: 18 }, // Required Quantity
    { wch: 14 }, // Cut Quantity
    { wch: 12 }, // Result
    { wch: 26 }, // Status
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cutting Requirement");

  // Optional: Add secondary sheet with student details if available
  if (calculationResult.classSummaries && calculationResult.classSummaries.length > 0) {
    const studentHeader = [
      ["EVENVIBE UNIFORMS - STUDENT CUTTING BREAKDOWN"],
      ["Order Number:", orderNumber],
      ["School Name:", schoolName || "—"],
      [],
      [
        "Student Name",
        "Admission No.",
        "Class",
        "Section",
        "Gender",
        "Item",
        "Style",
        "Color",
        "Size",
        "Quantity",
      ],
    ];

    const studentRows: (string | number)[][] = [];
    calculationResult.classSummaries.forEach((cs) => {
      cs.students.forEach((st) => {
        st.uniforms.forEach((u) => {
          studentRows.push([
            st.studentName,
            st.admissionNumber || "—",
            st.className,
            st.section || "—",
            st.gender,
            u.itemName,
            u.styleName || "Standard",
            u.color || "Standard",
            u.size,
            u.quantity,
          ]);
        });
      });
    });

    const fullStudentData = [...studentHeader, ...studentRows];
    const studentWorksheet = XLSX.utils.aoa_to_sheet(fullStudentData);
    studentWorksheet["!cols"] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(workbook, studentWorksheet, "Order Students");
  }

  return workbook;
}

export function exportCuttingExcel({
  orderNumber,
  schoolName,
  calculationResult,
}: ExportCuttingExcelParams): void {
  const workbook = buildCuttingWorkbook({ orderNumber, schoolName, calculationResult });

  // Generate file download matching exact format: EVENVIBE-Cutting-[ORDER_NUMBER].xlsx
  const cleanOrderNumber = orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `EVENVIBE-Cutting-${cleanOrderNumber}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}
