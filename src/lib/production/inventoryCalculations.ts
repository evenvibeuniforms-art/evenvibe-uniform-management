export interface ReqItemSnapshot {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name?: string | null;
  gender?: string | null;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  quantity: number;
}

export interface StoredInventoryMaterial {
  id?: string;
  order_id: string;
  item_name: string;
  style_id: string | null;
  style_name: string | null;
  color: string | null;
  gram_per_piece: number;
  quantity: number;
  total_grams: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryCalculationRow {
  rowKey: string;
  itemName: string;
  styleId: string | null;
  styleName: string | null;
  cleanStyleName: string | null;
  displayName: string; // e.g. "Pant — Style 1" or "Pant"
  color: string | null;
  displayColor: string; // "Black" or "—"
  gramPerPiece: number | null;
  quantity: number; // strictly from Stock Sizes / snapshot
  totalGrams: number;
  totalKg: number;
  isConfigured: boolean;
}

export interface InventoryCalculationResult {
  rows: InventoryCalculationRow[];
  totalStyles: number;
  totalColors: number;
  totalPieces: number;
  totalMaterialGrams: number;
  totalMaterialKg: number;
  allRowsConfigured: boolean;
  missingCount: number;
}

// Client-friendly sanitizers: NEVER expose internal database terms like "Legacy Style"
export function getCleanStyleName(styleName?: string | null): string | null {
  if (!styleName) return null;
  const clean = styleName.trim();
  const lower = clean.toLowerCase();
  if (
    lower === "legacy style" ||
    lower === "legacy" ||
    lower === "standard style" ||
    lower === "standard" ||
    lower === "default" ||
    lower === "n/a" ||
    lower === "none" ||
    lower.startsWith("style not")
  ) {
    return null;
  }
  return clean;
}

export function formatClientColor(color?: string | null): string {
  if (!color) return "—";
  const clean = color.trim();
  const lower = clean.toLowerCase();
  if (
    lower === "no color" ||
    lower === "nocolor" ||
    lower === "not specified" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "color: not specified"
  ) {
    return "—";
  }
  return clean;
}

export function formatWeightDisplay(grams: number): { kgDisplay: string; gramsDisplay: string } {
  const kg = Math.round((grams / 1000) * 100) / 100;
  return {
    kgDisplay: `${kg.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`,
    gramsDisplay: `${grams.toLocaleString("en-IN")} g`,
  };
}

export function buildInventoryRowKey(
  itemName: string,
  styleId: string | null,
  styleName: string | null,
  color: string | null
): string {
  const normItem = itemName.trim().toLowerCase();
  const normStyleId = styleId ? styleId.trim().toLowerCase() : "no_style_id";
  const normStyleName = styleName ? styleName.trim().toLowerCase() : "no_style_name";
  const normColor = color ? color.trim().toLowerCase() : "no_color";
  return `${normItem}__${normStyleId}__${normStyleName}__${normColor}`;
}

export function calculateInventoryRequirements(
  requirementItems: ReqItemSnapshot[],
  savedMaterials: StoredInventoryMaterial[] = []
): InventoryCalculationResult {
  // 1. Build lookup for saved gram_per_piece values
  const savedMap = new Map<string, StoredInventoryMaterial>();
  savedMaterials.forEach((sm) => {
    const key = buildInventoryRowKey(sm.item_name, sm.style_id, sm.style_name, sm.color);
    savedMap.set(key, sm);
  });

  // 2. Aggregate quantities from authoritative order requirement items (Stock Sizes)
  // Group strictly by (item_name, style_id, style_name, color)
  interface AggregatedEntry {
    itemName: string;
    styleId: string | null;
    styleName: string | null;
    color: string | null;
    quantity: number;
  }

  const aggMap = new Map<string, AggregatedEntry>();

  requirementItems.forEach((item) => {
    const itemName = item.item_name ? item.item_name.trim() : "Uniform Item";
    const styleId = item.style_id ? item.style_id.trim() : null;
    const styleName = item.style_name ? item.style_name.trim() : null;
    const color = item.color ? item.color.trim() : null;
    const qty = item.quantity || 0;

    const key = buildInventoryRowKey(itemName, styleId, styleName, color);
    const existing = aggMap.get(key);

    if (existing) {
      existing.quantity += qty;
    } else {
      aggMap.set(key, {
        itemName,
        styleId,
        styleName,
        color,
        quantity: qty,
      });
    }
  });

  // 3. Transform into sorted InventoryCalculationRow array
  const rows: InventoryCalculationRow[] = Array.from(aggMap.entries()).map(
    ([key, agg]) => {
      const cleanStyle = getCleanStyleName(agg.styleName);
      const displayColor = formatClientColor(agg.color);
      const displayName = cleanStyle
        ? `${agg.itemName} — ${cleanStyle}`
        : agg.itemName;

      const saved = savedMap.get(key);
      const gramPerPiece =
        saved && typeof saved.gram_per_piece === "number" && saved.gram_per_piece > 0
          ? saved.gram_per_piece
          : null;

      const isConfigured = gramPerPiece !== null && gramPerPiece > 0;
      const totalGrams = isConfigured
        ? Math.round(gramPerPiece * agg.quantity * 100) / 100
        : 0;
      const totalKg = isConfigured ? Math.round((totalGrams / 1000) * 100) / 100 : 0;

      return {
        rowKey: key,
        itemName: agg.itemName,
        styleId: agg.styleId,
        styleName: agg.styleName,
        cleanStyleName: cleanStyle,
        displayName,
        color: agg.color,
        displayColor,
        gramPerPiece,
        quantity: agg.quantity,
        totalGrams,
        totalKg,
        isConfigured,
      };
    }
  );

  // Natural alphabetical sorting: item_name -> cleanStyleName -> color
  rows.sort((a, b) => {
    const itemComp = a.itemName.localeCompare(b.itemName);
    if (itemComp !== 0) return itemComp;
    const styleComp = (a.cleanStyleName || "").localeCompare(b.cleanStyleName || "");
    if (styleComp !== 0) return styleComp;
    return a.displayColor.localeCompare(b.displayColor);
  });

  // 4. Calculate Summary Metrics
  const distinctStyles = new Set<string>();
  const distinctColors = new Set<string>();

  rows.forEach((r) => {
    if (r.cleanStyleName) {
      distinctStyles.add(`${r.itemName}__${r.cleanStyleName}`);
    } else {
      distinctStyles.add(r.itemName);
    }
    if (r.displayColor !== "—") {
      distinctColors.add(r.displayColor);
    }
  });

  const totalPieces = rows.reduce((sum, r) => sum + r.quantity, 0);
  const totalMaterialGrams = rows.reduce((sum, r) => sum + r.totalGrams, 0);
  const totalMaterialKg = Math.round((totalMaterialGrams / 1000) * 100) / 100;
  const missingCount = rows.filter((r) => !r.isConfigured).length;
  const allRowsConfigured = rows.length > 0 && missingCount === 0;

  return {
    rows,
    totalStyles: distinctStyles.size,
    totalColors: distinctColors.size,
    totalPieces,
    totalMaterialGrams,
    totalMaterialKg,
    allRowsConfigured,
    missingCount,
  };
}
