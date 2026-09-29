"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCircle, Download, ChevronRight, ChevronDown, Scissors, Layers, Shirt } from "lucide-react";

export interface ReqItem {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name: string | null;
  gender: string | null;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  quantity: number;
}

export default function AdminOrderQuantityBreakdown({
  requirementItems,
  orderNumber,
  schoolName,
}: {
  requirementItems: ReqItem[];
  orderNumber: string;
  schoolName: string;
}) {
  const isLegacy = requirementItems.some((item) => item.class_name === null && item.section_name === null);

  const [genderFilter, setGenderFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [itemFilter, setItemFilter] = useState<string>("");
  const [styleFilter, setStyleFilter] = useState<string>("");
  const [colorFilter, setColorFilter] = useState<string>("");
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("stitching");

  const filteredItems = useMemo(() => {
    return requirementItems.filter((item) => {
      if (genderFilter && item.gender !== genderFilter) return false;
      if (classFilter && item.class_name !== classFilter) return false;
      if (sectionFilter && item.section_name !== sectionFilter) return false;
      if (itemFilter && item.item_name !== itemFilter) return false;
      if (styleFilter) {
        const itemStyle = item.style_name || "Style not available";
        if (itemStyle !== styleFilter) return false;
      }
      if (colorFilter) {
        const itemColor = item.color && item.color.trim() !== "" ? item.color.trim() : "Not specified";
        if (itemColor !== colorFilter) return false;
      }
      if (sizeFilter && item.size !== sizeFilter) return false;
      return true;
    });
  }, [requirementItems, genderFilter, classFilter, sectionFilter, itemFilter, styleFilter, colorFilter, sizeFilter]);

  const uniqueClasses = useMemo(
    () => Array.from(new Set(requirementItems.map((i) => i.class_name).filter(Boolean))) as string[],
    [requirementItems]
  );
  const uniqueSections = useMemo(
    () => Array.from(new Set(requirementItems.map((i) => i.section_name).filter(Boolean))) as string[],
    [requirementItems]
  );
  const uniqueItems = useMemo(
    () => Array.from(new Set(requirementItems.map((i) => i.item_name).filter(Boolean))) as string[],
    [requirementItems]
  );
  const uniqueStyles = useMemo(
    () =>
      Array.from(
        new Set(
          requirementItems.map((i) => i.style_name || "Style not available")
        )
      ).sort(),
    [requirementItems]
  );
  const uniqueColors = useMemo(
    () =>
      Array.from(
        new Set(
          requirementItems.map((i) =>
            i.color && i.color.trim() !== "" ? i.color.trim() : "Not specified"
          )
        )
      ).sort(),
    [requirementItems]
  );
  const uniqueSizes = useMemo(
    () => Array.from(new Set(requirementItems.map((i) => i.size).filter(Boolean))) as string[],
    [requirementItems]
  );
  const uniqueGenders = useMemo(
    () => Array.from(new Set(requirementItems.map((i) => i.gender).filter(Boolean))) as string[],
    [requirementItems]
  );

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Stitching Summary by Style (Style, Item, Color, Size, Quantity)
    const stitchingData: Record<string, number> = {};
    requirementItems.forEach((i) => {
      const style = i.style_name || "Style not available";
      const color = i.color && i.color.trim() !== "" ? i.color.trim() : "Not specified";
      const key = `${style}|${i.item_name}|${color}|${i.size}`;
      stitchingData[key] = (stitchingData[key] || 0) + i.quantity;
    });

    const s1 = Object.entries(stitchingData).map(([key, qty]) => {
      const [style, item, color, size] = key.split("|");
      return { "Style Name": style, Item: item, Color: color, Size: size, Quantity: qty };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1), "Stitching By Style");

    // Sheet 2: Class & Section Summary
    if (!isLegacy) {
      const s2 = requirementItems.map((i) => ({
        Class: i.class_name || "Unknown",
        Section: i.section_name || "Unknown",
        Gender: i.gender || "Unknown",
        Style: i.style_name || "Style not available",
        Item: i.item_name,
        Color: i.color && i.color.trim() !== "" ? i.color.trim() : "Not specified",
        Size: i.size,
        Quantity: i.quantity,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2), "Class & Section Summary");
    }

    // Sheet 3: Production Overall
    const prodData: Record<string, number> = {};
    requirementItems.forEach((i) => {
      const style = i.style_name || "Style not available";
      const color = i.color && i.color.trim() !== "" ? i.color.trim() : "Not specified";
      const key = `${style}|${i.item_name}|${color}`;
      prodData[key] = (prodData[key] || 0) + i.quantity;
    });
    const s3 = Object.entries(prodData).map(([key, qty]) => {
      const [style, item, color] = key.split("|");
      return { Style: style, Item: item, Color: color, "Total Quantity": qty };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3), "Production Summary");

    XLSX.writeFile(wb, `${schoolName.replace(/\s+/g, "_")}_${orderNumber}_Stitching_Breakdown.xlsx`);
  };

  // Stitching Planning grouping: Style -> Item -> Color -> Size -> Total
  const stitchingGroups = useMemo(() => {
    interface SizeDetail {
      size: string;
      quantity: number;
      classBreakdown: { class_name: string; section: string; qty: number }[];
    }
    interface ColorGroup {
      color_name: string;
      totalQuantity: number;
      sizes: Record<string, SizeDetail>;
    }
    interface ItemGroup {
      item_name: string;
      totalQuantity: number;
      colors: Record<string, ColorGroup>;
    }
    interface StyleGroup {
      style_name: string;
      totalQuantity: number;
      items: Record<string, ItemGroup>;
    }

    const groups: Record<string, StyleGroup> = {};

    filteredItems.forEach((item) => {
      const styleKey = item.style_name ? item.style_name.trim() : "Style not available";
      const itemKey = item.item_name.trim();
      const colorKey = item.color && item.color.trim() !== "" ? item.color.trim() : "Not specified";
      const sizeKey = item.size.trim();

      if (!groups[styleKey]) {
        groups[styleKey] = {
          style_name: styleKey,
          totalQuantity: 0,
          items: {},
        };
      }
      groups[styleKey].totalQuantity += item.quantity;

      if (!groups[styleKey].items[itemKey]) {
        groups[styleKey].items[itemKey] = {
          item_name: itemKey,
          totalQuantity: 0,
          colors: {},
        };
      }
      groups[styleKey].items[itemKey].totalQuantity += item.quantity;

      if (!groups[styleKey].items[itemKey].colors[colorKey]) {
        groups[styleKey].items[itemKey].colors[colorKey] = {
          color_name: colorKey,
          totalQuantity: 0,
          sizes: {},
        };
      }
      groups[styleKey].items[itemKey].colors[colorKey].totalQuantity += item.quantity;

      if (!groups[styleKey].items[itemKey].colors[colorKey].sizes[sizeKey]) {
        groups[styleKey].items[itemKey].colors[colorKey].sizes[sizeKey] = {
          size: sizeKey,
          quantity: 0,
          classBreakdown: [],
        };
      }
      const sizeRecord = groups[styleKey].items[itemKey].colors[colorKey].sizes[sizeKey];
      sizeRecord.quantity += item.quantity;

      if (item.class_name) {
        sizeRecord.classBreakdown.push({
          class_name: item.class_name,
          section: item.section_name || "-",
          qty: item.quantity,
        });
      }
    });

    return Object.values(groups).sort((a, b) => a.style_name.localeCompare(b.style_name));
  }, [filteredItems]);

  // Class drilldown node logic
  const getGroupedData = (items: ReqItem[], level: "class" | "section" | "gender" | "style" | "item" | "color" | "size") => {
    const grouped = items.reduce((acc, item) => {
      let key = "Unknown";
      if (level === "class") key = item.class_name || "Unknown";
      if (level === "section") key = item.section_name || "Unknown";
      if (level === "gender") key = item.gender || "Unknown";
      if (level === "style") key = item.style_name || "Style not available";
      if (level === "item") key = item.item_name;
      if (level === "color") key = item.color && item.color.trim() !== "" ? item.color.trim() : "Not specified";
      if (level === "size") key = item.size;

      if (!acc[key]) acc[key] = { items: [], total: 0 };
      acc[key].items.push(item);
      acc[key].total += item.quantity;
      return acc;
    }, {} as Record<string, { items: ReqItem[]; total: number }>);

    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const DrilldownNode = ({
    items,
    currentLevel,
    name,
    total,
  }: {
    items: ReqItem[];
    currentLevel: "class" | "section" | "gender" | "style" | "item" | "color" | "size";
    name: string;
    total: number;
  }) => {
    const [expanded, setExpanded] = useState(false);

    let nextLevel: "section" | "gender" | "style" | "item" | "color" | "size" | null = null;
    if (currentLevel === "class") nextLevel = "section";
    else if (currentLevel === "section") nextLevel = "gender";
    else if (currentLevel === "gender") nextLevel = "style";
    else if (currentLevel === "style") nextLevel = "item";
    else if (currentLevel === "item") nextLevel = "color";
    else if (currentLevel === "color") nextLevel = "size";

    if (currentLevel === "size") {
      return (
        <div className="flex justify-between items-center py-2 px-4 bg-slate-50 border-b border-slate-200 last:border-b-0 text-sm">
          <span>Size {name}</span>
          <span className="font-semibold">{total}</span>
        </div>
      );
    }

    const children = getGroupedData(items, nextLevel!);

    return (
      <div className="border border-slate-200 rounded-md mb-2 overflow-hidden bg-white">
        <button
          suppressHydrationWarning
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-2 font-medium">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
            <span className="capitalize">
              {currentLevel === "class"
                ? name === "Unknown"
                  ? "Class Unknown"
                  : name
                : currentLevel === "style"
                ? `Style: ${name}`
                : currentLevel === "color"
                ? `Color: ${name}`
                : name}
            </span>
          </div>
          <div className="text-sm bg-slate-100 px-2 py-1 rounded font-semibold text-slate-700">
            {total} Qty
          </div>
        </button>
        {expanded && (
          <div className="pl-4 pr-0 py-2 border-t border-slate-100 bg-slate-50/50">
            {children.map(([childName, childData]) => (
              <DrilldownNode
                key={childName}
                items={childData.items}
                currentLevel={nextLevel!}
                name={childName}
                total={childData.total}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {isLegacy && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold">Legacy Order</h4>
            <p className="text-sm">
              Granular style or section mapping is unavailable for older historical records. Displaying legacy item and size aggregation.
            </p>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-end justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-wrap gap-3 flex-1">
          {/* Style Filter */}
          <div className="space-y-1.5 w-full sm:w-auto min-w-[140px]">
            <label className="text-xs font-semibold text-slate-600 uppercase">Style</label>
            <Select value={styleFilter || "all"} onValueChange={(v) => setStyleFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="All Styles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Styles</SelectItem>
                {uniqueStyles.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
            <label className="text-xs font-semibold text-slate-600 uppercase">Item</label>
            <Select value={itemFilter || "all"} onValueChange={(v) => setItemFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="All Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {uniqueItems.map((i) => (
                  <SelectItem key={i || "unknown"} value={i || "unknown"} className="capitalize">
                    {i || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isLegacy && (
            <>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
                <label className="text-xs font-semibold text-slate-600 uppercase">Class</label>
                <Select value={classFilter || "all"} onValueChange={(v) => setClassFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {uniqueClasses.map((c) => (
                      <SelectItem key={c || "unknown"} value={c || "unknown"}>
                        {c || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 w-full sm:w-auto min-w-[110px]">
                <label className="text-xs font-semibold text-slate-600 uppercase">Section</label>
                <Select value={sectionFilter || "all"} onValueChange={(v) => setSectionFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {uniqueSections.map((s) => (
                      <SelectItem key={s || "unknown"} value={s || "unknown"}>
                        {s || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 w-full sm:w-auto min-w-[110px]">
                <label className="text-xs font-semibold text-slate-600 uppercase">Gender</label>
                <Select value={genderFilter || "all"} onValueChange={(v) => setGenderFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="All Genders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    {uniqueGenders.map((g) => (
                      <SelectItem key={g || "unknown"} value={g || "unknown"} className="capitalize">
                        {g || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-1.5 w-full sm:w-auto min-w-[130px]">
            <label className="text-xs font-semibold text-slate-600 uppercase">Color</label>
            <Select value={colorFilter || "all"} onValueChange={(v) => setColorFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="All Colors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colors</SelectItem>
                {uniqueColors.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 w-full sm:w-auto min-w-[110px]">
            <label className="text-xs font-semibold text-slate-600 uppercase">Size</label>
            <Select value={sizeFilter || "all"} onValueChange={(v) => setSizeFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="All Sizes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sizes</SelectItem>
                {uniqueSizes.map((s) => (
                  <SelectItem key={s || "unknown"} value={s || "unknown"}>
                    {s || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button variant="outline" className="w-full sm:w-auto shrink-0 bg-white shadow-xs" onClick={exportExcel}>
          <Download className="mr-2 h-4 w-4" /> Export Stitching Sheet
        </Button>
      </div>

      {/* Tabs between Stitching Planning and Class Drilldown */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
          <TabsList className="w-full sm:w-auto grid grid-cols-1 sm:grid-cols-2 bg-slate-100 h-auto p-1 gap-1">
            <TabsTrigger value="stitching" className="flex items-center justify-center gap-1.5 data-[state=active]:bg-white text-xs py-1.5 px-2">
              <Scissors className="h-4 w-4 text-evenvibe-primary" />
              <span>Stitching Planning (By Style)</span>
            </TabsTrigger>
            <TabsTrigger value="drilldown" className="flex items-center justify-center gap-1.5 data-[state=active]:bg-white text-xs py-1.5 px-2">
              <Layers className="h-4 w-4 text-evenvibe-primary" />
              <span>Class & Section Breakdown</span>
            </TabsTrigger>
          </TabsList>

          <div className="text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-xs self-start sm:self-auto">
            Filtered Total Pieces: <span className="text-evenvibe-deep font-bold">{filteredItems.reduce((acc, item) => acc + item.quantity, 0)}</span>
          </div>
        </div>

        {/* TAB 1: Stitching Planning (By Style -> Item -> Color -> Size) */}
        <TabsContent value="stitching" className="space-y-6">
          {stitchingGroups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-slate-500">
                No items match the current filter selection.
              </CardContent>
            </Card>
          ) : (
            stitchingGroups.map((styleGroup) => (
              <Card key={styleGroup.style_name} className="overflow-hidden border border-slate-200 shadow-sm bg-white">
                <CardHeader className="bg-slate-50/75 border-b border-slate-200 py-3.5 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Shirt className="h-5 w-5 text-evenvibe-primary" />
                      <div>
                        <CardTitle className="text-base font-bold text-slate-900">
                          {styleGroup.style_name}
                        </CardTitle>
                        <span className="text-xs text-slate-500">Uniform Style Design</span>
                      </div>
                    </div>

                    <Badge className="bg-evenvibe-primary text-white font-bold text-sm px-3 py-1">
                      Total: {styleGroup.totalQuantity} pcs
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-6">
                  {Object.values(styleGroup.items).map((itemGroup) => (
                    <div key={itemGroup.item_name} className="space-y-4">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          <span>{itemGroup.item_name}</span>
                          <span className="text-xs font-normal text-slate-500">
                            ({Object.keys(itemGroup.colors).length} {Object.keys(itemGroup.colors).length === 1 ? "color" : "colors"})
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          Item Total: {itemGroup.totalQuantity} pcs
                        </span>
                      </div>

                      {/* Colors under this Item */}
                      <div className="space-y-4 pl-0 sm:pl-2">
                        {Object.values(itemGroup.colors)
                          .sort((a, b) => a.color_name.localeCompare(b.color_name))
                          .map((colorGroup) => (
                            <div key={colorGroup.color_name} className="space-y-2.5 p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Color:</span>
                                  <Badge
                                    variant="outline"
                                    className={
                                      colorGroup.color_name === "Not specified"
                                        ? "bg-slate-100 text-slate-600 border-slate-300 font-medium text-xs px-2.5 py-0.5"
                                        : "bg-blue-50 text-blue-700 border-blue-300 font-bold text-xs px-2.5 py-0.5 shadow-2xs"
                                    }
                                  >
                                    {colorGroup.color_name}
                                  </Badge>
                                  <span className="text-xs text-slate-400 font-normal">
                                    ({Object.keys(colorGroup.sizes).length} sizes)
                                  </span>
                                </div>
                                <span className="text-xs font-bold text-evenvibe-deep bg-evenvibe-light border border-emerald-200 px-2.5 py-0.5 rounded">
                                  Color Subtotal: {colorGroup.totalQuantity} pcs
                                </span>
                              </div>

                              {/* Sizes Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                                {Object.values(colorGroup.sizes)
                                  .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                                  .map((sizeItem) => (
                                    <div
                                      key={sizeItem.size}
                                      className="rounded-lg border border-slate-200 bg-white p-3 hover:border-emerald-500 transition-colors shadow-2xs"
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-slate-600">Size</span>
                                        <span className="text-sm font-extrabold text-slate-900">{sizeItem.size}</span>
                                      </div>
                                      <div className="text-xl font-black text-evenvibe-deep text-center py-1">
                                        {sizeItem.quantity}
                                        <span className="text-[11px] font-normal text-slate-500 ml-1">pcs</span>
                                      </div>

                                      {/* Class Breakdown tooltip / list if available */}
                                      {sizeItem.classBreakdown.length > 0 && (
                                        <div className="text-[10px] text-slate-500 border-t border-slate-100 pt-1 mt-1 truncate">
                                          {sizeItem.classBreakdown.map((cb, idx) => (
                                            <span key={idx} className="block truncate">
                                              {cb.class_name}-{cb.section}: {cb.qty}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* TAB 2: Class & Section Drilldown */}
        <TabsContent value="drilldown">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-bold">Class & Section Hierarchy</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {!isLegacy ? (
                <div className="space-y-2">
                  {getGroupedData(filteredItems, "class").map(([c, data]) => (
                    <DrilldownNode
                      key={c}
                      items={data.items}
                      currentLevel="class"
                      name={c === "Unknown" ? "Class Unknown" : c}
                      total={data.total}
                    />
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No items match the current filters.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {getGroupedData(filteredItems, "item").map(([item, data]) => (
                    <DrilldownNode
                      key={item}
                      items={data.items}
                      currentLevel="item"
                      name={item}
                      total={data.total}
                    />
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No items match the current filters.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
