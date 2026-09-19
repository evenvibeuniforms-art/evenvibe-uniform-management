"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, ChevronRight, ChevronDown } from "lucide-react";

export interface ReqItem {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name: string | null;
  gender: string | null;
  item_name: string;
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
  const [sizeFilter, setSizeFilter] = useState<string>("");

  const filteredItems = useMemo(() => {
    return requirementItems.filter((item) => {
      if (genderFilter && item.gender !== genderFilter) return false;
      if (classFilter && item.class_name !== classFilter) return false;
      if (sectionFilter && item.section_name !== sectionFilter) return false;
      if (itemFilter && item.item_name !== itemFilter) return false;
      if (sizeFilter && item.size !== sizeFilter) return false;
      return true;
    });
  }, [requirementItems, genderFilter, classFilter, sectionFilter, itemFilter, sizeFilter]);

  const uniqueClasses = useMemo(() => Array.from(new Set(requirementItems.map((i) => i.class_name).filter(Boolean))) as string[], [requirementItems]);
  const uniqueSections = useMemo(() => Array.from(new Set(requirementItems.map((i) => i.section_name).filter(Boolean))) as string[], [requirementItems]);
  const uniqueItems = useMemo(() => Array.from(new Set(requirementItems.map((i) => i.item_name).filter(Boolean))) as string[], [requirementItems]);
  const uniqueSizes = useMemo(() => Array.from(new Set(requirementItems.map((i) => i.size).filter(Boolean))) as string[], [requirementItems]);
  const uniqueGenders = useMemo(() => Array.from(new Set(requirementItems.map((i) => i.gender).filter(Boolean))) as string[], [requirementItems]);

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Overall Summary (Gender, Item, Size, Quantity)
    const overallData: Record<string, number> = {};
    requirementItems.forEach(i => {
      const g = i.gender || 'Unknown';
      const key = `${g}|${i.item_name}|${i.size}`;
      overallData[key] = (overallData[key] || 0) + i.quantity;
    });
    const s1 = Object.entries(overallData).map(([key, qty]) => {
      const [g, item, size] = key.split('|');
      return { Gender: g, Item: item, Size: size, Quantity: qty };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1), "Overall Summary");

    // Sheet 2: Class & Section Summary
    if (!isLegacy) {
      const s2 = requirementItems.map(i => ({
        Class: i.class_name || 'Unknown',
        Section: i.section_name || 'Unknown',
        Gender: i.gender || 'Unknown',
        Item: i.item_name,
        Size: i.size,
        Quantity: i.quantity
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2), "Class & Section Summary");
    }

    // Sheet 3: Production Summary
    const prodData: Record<string, number> = {};
    requirementItems.forEach(i => {
      const g = i.gender || 'Unknown';
      const key = `${g}|${i.item_name}`;
      prodData[key] = (prodData[key] || 0) + i.quantity;
    });
    const s3 = Object.entries(prodData).map(([key, qty]) => {
      const [g, item] = key.split('|');
      return { Gender: g, Item: item, "Total Quantity": qty };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3), "Production Summary");

    XLSX.writeFile(wb, `${schoolName.replace(/\s+/g, '_')}_${orderNumber}_Quantity_Breakdown.xlsx`);
  };

  const getGroupedData = (items: ReqItem[], level: 'class' | 'section' | 'gender' | 'item' | 'size') => {
    const grouped = items.reduce((acc, item) => {
      let key = 'Unknown';
      if (level === 'class') key = item.class_name || 'Unknown';
      if (level === 'section') key = item.section_name || 'Unknown';
      if (level === 'gender') key = item.gender || 'Unknown';
      if (level === 'item') key = item.item_name;
      if (level === 'size') key = item.size;
      
      if (!acc[key]) acc[key] = { items: [], total: 0 };
      acc[key].items.push(item);
      acc[key].total += item.quantity;
      return acc;
    }, {} as Record<string, { items: ReqItem[], total: number }>);

    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const DrilldownNode = ({ items, currentLevel, name, total }: { items: ReqItem[], currentLevel: 'class' | 'section' | 'gender' | 'item' | 'size', name: string, total: number }) => {
    const [expanded, setExpanded] = useState(false);
    
    let nextLevel: 'section' | 'gender' | 'item' | 'size' | null = null;
    if (currentLevel === 'class') nextLevel = 'section';
    else if (currentLevel === 'section') nextLevel = 'gender';
    else if (currentLevel === 'gender') nextLevel = 'item';
    else if (currentLevel === 'item') nextLevel = 'size';

    if (currentLevel === 'size') {
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
            {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
            <span className="capitalize">{currentLevel === 'class' ? (name === 'Unknown' ? 'Class Unknown' : name) : name}</span>
          </div>
          <div className="text-sm bg-slate-100 px-2 py-1 rounded font-semibold text-slate-700">
            {total} Qty
          </div>
        </button>
        {expanded && (
          <div className="pl-4 pr-0 py-2 border-t border-slate-100 bg-slate-50/50">
            {children.map(([childName, childData]) => (
              <DrilldownNode key={childName} items={childData.items} currentLevel={nextLevel!} name={childName} total={childData.total} />
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
            <p className="text-sm">Detailed Class/Section/Gender breakdown is unavailable for this historical order. Showing item and size summary only.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-end justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-wrap gap-4 flex-1">
          {!isLegacy && (
            <>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 uppercase">Class</label>
                <Select value={classFilter || "all"} onValueChange={(v) => setClassFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All Classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {uniqueClasses.map(c => <SelectItem key={c || "unknown"} value={c || "unknown"}>{c || "Unknown"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 uppercase">Section</label>
                <Select value={sectionFilter || "all"} onValueChange={(v) => setSectionFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All Sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {uniqueSections.map(s => <SelectItem key={s || "unknown"} value={s || "unknown"}>{s || "Unknown"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 uppercase">Gender</label>
                <Select value={genderFilter || "all"} onValueChange={(v) => setGenderFilter(v === "all" || !v ? "" : v)}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All Genders" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    {uniqueGenders.map(g => <SelectItem key={g || "unknown"} value={g || "unknown"} className="capitalize">{g || "Unknown"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          
          <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
            <label className="text-xs font-medium text-slate-500 uppercase">Item</label>
            <Select value={itemFilter || "all"} onValueChange={(v) => setItemFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="All Items" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {uniqueItems.map(i => <SelectItem key={i || "unknown"} value={i || "unknown"} className="capitalize">{i || "Unknown"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-full sm:w-auto min-w-[120px]">
            <label className="text-xs font-medium text-slate-500 uppercase">Size</label>
            <Select value={sizeFilter || "all"} onValueChange={(v) => setSizeFilter(v === "all" || !v ? "" : v)}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="All Sizes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sizes</SelectItem>
                {uniqueSizes.map(s => <SelectItem key={s || "unknown"} value={s || "unknown"}>{s || "Unknown"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" className="shrink-0 bg-white" onClick={exportExcel}>
          <Download className="mr-2 h-4 w-4" /> Export Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Quantity Overview</CardTitle>
              <div className="text-xl font-bold text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100">
                Filtered Total: {filteredItems.reduce((acc, item) => acc + item.quantity, 0)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {!isLegacy ? (
              <div className="space-y-2">
                {getGroupedData(filteredItems, 'class').map(([c, data]) => (
                  <DrilldownNode key={c} items={data.items} currentLevel="class" name={c === 'Unknown' ? 'Class Unknown' : c} total={data.total} />
                ))}
                {filteredItems.length === 0 && <div className="text-center py-8 text-muted-foreground">No items match the current filters.</div>}
              </div>
            ) : (
              <div className="space-y-2">
                {getGroupedData(filteredItems, 'item').map(([item, data]) => (
                  <DrilldownNode key={item} items={data.items} currentLevel="item" name={item} total={data.total} />
                ))}
                {filteredItems.length === 0 && <div className="text-center py-8 text-muted-foreground">No items match the current filters.</div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
