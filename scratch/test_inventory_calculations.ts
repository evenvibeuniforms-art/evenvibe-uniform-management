import {
  calculateInventoryRequirements,
  formatWeightDisplay,
  type ReqItemSnapshot,
  type StoredInventoryMaterial,
} from "../src/lib/production/inventoryCalculations";
import { buildInventoryWorkbook } from "../src/lib/production/exportInventoryExcel";
import * as XLSX from "xlsx";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${message}`);
  }
}

console.log("=== RUNNING INVENTORY STAGE CALCULATION & INTEGRATION TESTS ===");

// 1. Example Data from Specification
const requirementItems: ReqItemSnapshot[] = [
  // Pant Style 1 Black (Sizes 28, 30, 32 => 30 + 40 + 30 = 100)
  { id: "1", requirement_id: "r1", class_name: "Grade 1", item_name: "Pant", style_name: "Style 1", color: "Black", size: "28", quantity: 30 },
  { id: "2", requirement_id: "r1", class_name: "Grade 1", item_name: "Pant", style_name: "Style 1", color: "Black", size: "30", quantity: 40 },
  { id: "3", requirement_id: "r1", class_name: "Grade 1", item_name: "Pant", style_name: "Style 1", color: "Black", size: "32", quantity: 30 },

  // Pant Style 1 Navy Blue (Sizes 28, 30 => 40 + 40 = 80)
  { id: "4", requirement_id: "r1", class_name: "Grade 1", item_name: "Pant", style_name: "Style 1", color: "Navy Blue", size: "28", quantity: 40 },
  { id: "5", requirement_id: "r1", class_name: "Grade 1", item_name: "Pant", style_name: "Style 1", color: "Navy Blue", size: "30", quantity: 40 },

  // Shirt Style 2 White (Sizes 34, 36 => 60 + 60 = 120)
  { id: "6", requirement_id: "r1", class_name: "Grade 1", item_name: "Shirt", style_name: "Style 2", color: "White", size: "34", quantity: 60 },
  { id: "7", requirement_id: "r1", class_name: "Grade 1", item_name: "Shirt", style_name: "Style 2", color: "White", size: "36", quantity: 60 },

  // Shirt Style 2 Sky Blue (Size 36 => 60)
  { id: "8", requirement_id: "r1", class_name: "Grade 1", item_name: "Shirt", style_name: "Style 2", color: "Sky Blue", size: "36", quantity: 60 },
];

const savedMaterials: StoredInventoryMaterial[] = [
  { order_id: "o1", item_name: "Pant", style_id: null, style_name: "Style 1", color: "Black", gram_per_piece: 250, quantity: 100, total_grams: 25000 },
  { order_id: "o1", item_name: "Pant", style_id: null, style_name: "Style 1", color: "Navy Blue", gram_per_piece: 250, quantity: 80, total_grams: 20000 },
  { order_id: "o1", item_name: "Shirt", style_id: null, style_name: "Style 2", color: "White", gram_per_piece: 180, quantity: 120, total_grams: 21600 },
  { order_id: "o1", item_name: "Shirt", style_id: null, style_name: "Style 2", color: "Sky Blue", gram_per_piece: 180, quantity: 60, total_grams: 10800 },
];

const result = calculateInventoryRequirements(requirementItems, savedMaterials);

// Test 1: Inventory quantity comes from Stock Sizes & size quantities aggregate
const pantBlack = result.rows.find(r => r.itemName === "Pant" && r.styleName === "Style 1" && r.color === "Black");
assert(pantBlack !== undefined, "Pant Style 1 Black row exists");
assert(pantBlack?.quantity === 100, `Pant Style 1 Black quantity is 100 (got ${pantBlack?.quantity})`);

// Test 2: Style + Color create separate rows
const pantNavy = result.rows.find(r => r.itemName === "Pant" && r.styleName === "Style 1" && r.color === "Navy Blue");
assert(pantNavy !== undefined, "Pant Style 1 Navy Blue row exists separately");
assert(pantNavy?.quantity === 80, `Pant Style 1 Navy Blue quantity is 80 (got ${pantNavy?.quantity})`);

// Test 3: Total rows count is exactly 4
assert(result.rows.length === 4, `4 distinct Style + Color rows exist (got ${result.rows.length})`);

// Test 4: Calculation: Gram × Quantity = Total Grams & Total Kg
assert(pantBlack?.totalGrams === 25000, `Pant Black total grams = 25000 (got ${pantBlack?.totalGrams})`);
assert(pantBlack?.totalKg === 25, `Pant Black total kg = 25 (got ${pantBlack?.totalKg})`);

assert(pantNavy?.totalGrams === 20000, `Pant Navy total grams = 20000 (got ${pantNavy?.totalGrams})`);
assert(pantNavy?.totalKg === 20, `Pant Navy total kg = 20 (got ${pantNavy?.totalKg})`);

const shirtWhite = result.rows.find(r => r.itemName === "Shirt" && r.styleName === "Style 2" && r.color === "White");
assert(shirtWhite?.totalGrams === 21600, `Shirt White total grams = 21600 (got ${shirtWhite?.totalGrams})`);
assert(shirtWhite?.totalKg === 21.6, `Shirt White total kg = 21.6 (got ${shirtWhite?.totalKg})`);

const shirtSkyBlue = result.rows.find(r => r.itemName === "Shirt" && r.styleName === "Style 2" && r.color === "Sky Blue");
assert(shirtSkyBlue?.totalGrams === 10800, `Shirt Sky Blue total grams = 10800 (got ${shirtSkyBlue?.totalGrams})`);
assert(shirtSkyBlue?.totalKg === 10.8, `Shirt Sky Blue total kg = 10.8 (got ${shirtSkyBlue?.totalKg})`);

// Test 5: Grand totals match prompt exactly (77,400 g = 77.4 kg, 360 pieces)
assert(result.totalPieces === 360, `Grand total pieces = 360 (got ${result.totalPieces})`);
assert(result.totalMaterialGrams === 77400, `Grand total grams = 77400 (got ${result.totalMaterialGrams})`);
assert(result.totalMaterialKg === 77.4, `Grand total kg = 77.4 (got ${result.totalMaterialKg})`);

// Test 6: Summary cards metrics
assert(result.totalStyles === 2, `Total styles count = 2 (got ${result.totalStyles})`);
assert(result.totalColors === 4, `Total colors count = 4 (got ${result.totalColors})`);
assert(result.allRowsConfigured === true, "allRowsConfigured is true when all 4 rows have valid grams");

// Test 7: Decimal grams support (e.g., 225.5 g)
const decimalTestItems: ReqItemSnapshot[] = [
  { id: "d1", requirement_id: "r1", class_name: "Grade 1", item_name: "Skirt", style_name: "Style A", color: "Maroon", size: "M", quantity: 100 }
];
const decimalSaved: StoredInventoryMaterial[] = [
  { order_id: "o1", item_name: "Skirt", style_id: null, style_name: "Style A", color: "Maroon", gram_per_piece: 225.5, quantity: 100, total_grams: 22550 }
];
const decimalResult = calculateInventoryRequirements(decimalTestItems, decimalSaved);
assert(decimalResult.rows[0].totalGrams === 22550, `Decimal gram total = 22550 g (got ${decimalResult.rows[0].totalGrams})`);
assert(decimalResult.rows[0].totalKg === 22.55, `Decimal gram kg = 22.55 kg (got ${decimalResult.rows[0].totalKg})`);

// Test 8: Missing grams row is detected and prevents completion
const incompleteSaved: StoredInventoryMaterial[] = [
  { order_id: "o1", item_name: "Pant", style_id: null, style_name: "Style 1", color: "Black", gram_per_piece: 250, quantity: 100, total_grams: 25000 },
  // Missing other rows
];
const incompleteResult = calculateInventoryRequirements(requirementItems, incompleteSaved);
assert(incompleteResult.allRowsConfigured === false, "allRowsConfigured is false when rows are missing grams");
assert(incompleteResult.missingCount === 3, `missingCount is 3 (got ${incompleteResult.missingCount})`);

// Test 9: Legacy Style and Color sanitization
const legacyItems: ReqItemSnapshot[] = [
  { id: "l1", requirement_id: "r1", class_name: "Grade 1", item_name: "Belt", style_name: "Legacy Style", color: null, size: "Free", quantity: 50 },
  { id: "l2", requirement_id: "r1", class_name: "Grade 1", item_name: "Tie", style_name: "Standard Style", color: "No Color", size: "Free", quantity: 50 },
];
const legacyResult = calculateInventoryRequirements(legacyItems, []);
assert(legacyResult.rows[0].cleanStyleName === null, `Legacy Style is sanitized to null cleanStyleName (got '${legacyResult.rows[0].cleanStyleName}')`);
assert(legacyResult.rows[0].displayName === "Belt", `Legacy Style displayName is simply item name 'Belt' (got '${legacyResult.rows[0].displayName}')`);
assert(legacyResult.rows[0].displayColor === "—", `Null color is displayed as '—' (got '${legacyResult.rows[0].displayColor}')`);
assert(legacyResult.rows[1].displayColor === "—", `'No Color' is displayed as '—' (got '${legacyResult.rows[1].displayColor}')`);

// Test 10: Excel Export data matches screen data exactly
const wb = buildInventoryWorkbook({
  orderNumber: "EV-ORD-2026-E5A2AA",
  schoolName: "Test School",
  calculationResult: result,
});
const sheet = wb.Sheets["Inventory Requirement"];
assert(sheet !== undefined, "Excel sheet 'Inventory Requirement' created");

// Parse rows from sheet
const sheetData: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
// Find header row
const headerIndex = sheetData.findIndex(row => row && row[0] === "Order Number");
assert(headerIndex !== -1, "Excel contains standard header row");
// Verify row count matches
const dataRows = sheetData.slice(headerIndex + 1).filter(row => row && row[0] && row[0] !== "TOTAL");
assert(dataRows.length === 4, `Excel contains exactly 4 data rows (got ${dataRows.length})`);

// Verify Excel total row matches calculation
const totalRow = sheetData.find(row => row && row[0] === "TOTAL");
assert(totalRow !== undefined, "Excel contains TOTAL row");
if (totalRow) {
  assert(totalRow[6] === 360, `Excel Total Quantity is 360 (got ${totalRow[6]})`);
  assert(totalRow[7] === 77400, `Excel Total Grams is 77400 (got ${totalRow[7]})`);
  assert(totalRow[8] === 77.4, `Excel Total Kg is 77.4 (got ${totalRow[8]})`);
}

// Test 11: Format weight display
const formatted = formatWeightDisplay(77400);
assert(formatted.kgDisplay === "77.4 kg", `formatWeightDisplay produces '77.4 kg' (got '${formatted.kgDisplay}')`);
assert(formatted.gramsDisplay === "77,400 g", `formatWeightDisplay produces '77,400 g' (got '${formatted.gramsDisplay}')`);

console.log("=== ALL CALCULATION & INTEGRATION TESTS PASSED SUCCESSFULLY! ===");
