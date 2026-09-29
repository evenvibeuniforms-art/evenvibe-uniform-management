"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import {
  Users,
  Shirt,
  Layers,
  GraduationCap,
  ChevronRight,
  Search,
  Expand,
  Shrink,
  AlertCircle,
  LayoutGrid,
  ListFilter,
} from "lucide-react";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

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

interface StockSizesBreakdownProps {
  requirementItems: ReqItemSnapshot[];
  totalStudents?: number;
  classStudentCounts?: Record<string, number>;
  orderNumber?: string;
  schoolName?: string;
}

// Alpha size sort mapping for natural sizing order
const ALPHA_SIZE_ORDER: Record<string, number> = {
  XXXS: 1,
  "3XS": 1,
  XXS: 2,
  "2XS": 2,
  XS: 3,
  S: 4,
  SMALL: 4,
  M: 5,
  MEDIUM: 5,
  L: 6,
  LARGE: 6,
  XL: 7,
  XXL: 8,
  "2XL": 8,
  XXXL: 9,
  "3XL": 9,
  "4XL": 10,
  "5XL": 11,
};

function compareSizes(a: string, b: string): number {
  const cleanA = (a || "").trim();
  const cleanB = (b || "").trim();
  const numA = parseFloat(cleanA);
  const numB = parseFloat(cleanB);
  const isNumA = !isNaN(numA) && /^\d+(\.\d+)?$/.test(cleanA);
  const isNumB = !isNaN(numB) && /^\d+(\.\d+)?$/.test(cleanB);

  if (isNumA && isNumB) {
    return numA - numB;
  }
  if (isNumA && !isNumB) return -1;
  if (!isNumA && isNumB) return 1;

  const orderA = ALPHA_SIZE_ORDER[cleanA.toUpperCase()];
  const orderB = ALPHA_SIZE_ORDER[cleanB.toUpperCase()];
  if (orderA !== undefined && orderB !== undefined) {
    return orderA - orderB;
  }
  if (orderA !== undefined) return -1;
  if (orderB !== undefined) return 1;

  return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: "base" });
}

function compareClasses(a: string, b: string): number {
  const indexA = STANDARD_CLASSES.indexOf(a);
  const indexB = STANDARD_CLASSES.indexOf(b);

  if (indexA !== -1 && indexB !== -1) {
    return indexA - indexB;
  }
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// Client-friendly sanitizers: NEVER expose internal database terms like "Legacy Style"
function getCleanStyleName(styleName?: string | null): string | null {
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

function formatClientColor(color?: string | null): string {
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

function formatPieces(qty: number): string {
  return `${qty.toLocaleString()} ${qty === 1 ? "piece" : "pieces"}`;
}

export default function StockSizesBreakdown({
  requirementItems,
  totalStudents = 0,
  classStudentCounts = {},
  orderNumber,
  schoolName,
}: StockSizesBreakdownProps) {
  const [viewMode, setViewMode] = useState<"class_wise" | "overall">("class_wise");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("ALL");
  const [selectedItemFilter, setSelectedItemFilter] = useState<string>("ALL");
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  // 1. Calculate Summary Metrics for Client Overview
  const summaryMetrics = useMemo(() => {
    const totalPieces = requirementItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );

    const uniqueClasses = new Set<string>();
    const uniqueItems = new Set<string>();

    requirementItems.forEach((item) => {
      if (item.class_name) {
        uniqueClasses.add(item.class_name);
      }
      if (item.item_name) {
        uniqueItems.add(item.item_name.trim().toLowerCase());
      }
    });

    let uniqueStudentsCount = totalStudents;
    if (!uniqueStudentsCount || uniqueStudentsCount === 0) {
      const recordedClassSum = Object.values(classStudentCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      uniqueStudentsCount = recordedClassSum;
    }

    return {
      totalStudents: uniqueStudentsCount,
      classes: uniqueClasses.size,
      uniformItems: uniqueItems.size,
      totalPieces,
    };
  }, [requirementItems, totalStudents, classStudentCounts]);

  // List of unique classes and items for filters
  const allUniqueClasses = useMemo(() => {
    const set = new Set<string>();
    requirementItems.forEach((i) => {
      if (i.class_name) set.add(i.class_name);
    });
    return Array.from(set).sort(compareClasses);
  }, [requirementItems]);

  const allUniqueItems = useMemo(() => {
    const set = new Set<string>();
    requirementItems.forEach((i) => {
      if (i.item_name) set.add(i.item_name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [requirementItems]);

  // 2. Class-Wise Aggregation:
  // Class -> Item -> (Size + Color + Style rows)
  const classCardsData = useMemo(() => {
    interface SizeRow {
      size: string;
      color: string;
      styleName: string | null;
      quantity: number;
    }

    interface ItemSection {
      itemName: string;
      totalPieces: number;
      studentCount: number;
      hasMeaningfulStyle: boolean;
      rows: SizeRow[];
    }

    interface ClassSection {
      className: string;
      studentCount: number;
      totalPieces: number;
      items: ItemSection[];
    }

    // Map: className -> itemName -> mapKey -> SizeRow
    const classMap = new Map<string, Map<string, Map<string, SizeRow>>>();

    requirementItems.forEach((row) => {
      const className = row.class_name || "General / Unassigned";
      const itemName = row.item_name ? row.item_name.trim() : "Uniform Item";
      const styleName = getCleanStyleName(row.style_name);
      const color = formatClientColor(row.color);
      const size = (row.size || "Standard").trim();
      const quantity = row.quantity || 0;

      if (!classMap.has(className)) {
        classMap.set(className, new Map());
      }
      const itemMap = classMap.get(className)!;

      if (!itemMap.has(itemName)) {
        itemMap.set(itemName, new Map());
      }
      const rowMap = itemMap.get(itemName)!;

      // Group key: size + color + styleName
      const rowKey = `${size}__${color}__${styleName || "no_style"}`;
      const existing = rowMap.get(rowKey);
      if (existing) {
        existing.quantity += quantity;
      } else {
        rowMap.set(rowKey, {
          size,
          color,
          styleName,
          quantity,
        });
      }
    });

    const sortedClassNames = Array.from(classMap.keys()).sort(compareClasses);

    const result: ClassSection[] = sortedClassNames.map((className) => {
      const itemMap = classMap.get(className)!;
      const sortedItemNames = Array.from(itemMap.keys()).sort((a, b) =>
        a.localeCompare(b)
      );

      let classTotalPieces = 0;

      const items: ItemSection[] = sortedItemNames.map((itemName) => {
        const rowMap = itemMap.get(itemName)!;
        const rows: SizeRow[] = Array.from(rowMap.values()).sort((a, b) => {
          const sizeComp = compareSizes(a.size, b.size);
          if (sizeComp !== 0) return sizeComp;
          return a.color.localeCompare(b.color);
        });

        const totalPieces = rows.reduce((sum, r) => sum + r.quantity, 0);
        classTotalPieces += totalPieces;

        // Check if there is any meaningful style for this item
        const hasMeaningfulStyle = rows.some((r) => !!r.styleName);

        return {
          itemName,
          totalPieces,
          studentCount: totalPieces, // In uniform requirements, 1 piece = 1 student sizing requirement
          hasMeaningfulStyle,
          rows,
        };
      });

      // Class Student Count: Use verified count from order if available, or max pieces across items
      const assignedClassStudents = classStudentCounts[className];
      const maxItemStudents = items.reduce(
        (max, it) => Math.max(max, it.studentCount),
        0
      );
      const studentCount =
        typeof assignedClassStudents === "number" && assignedClassStudents > 0
          ? assignedClassStudents
          : maxItemStudents;

      return {
        className,
        studentCount,
        totalPieces: classTotalPieces,
        items,
      };
    });

    return result;
  }, [requirementItems, classStudentCounts]);

  // Filtered Class Cards based on simple client search & dropdowns
  const filteredClassCards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return classCardsData
      .filter((cls) => {
        if (selectedClassFilter !== "ALL" && cls.className !== selectedClassFilter) {
          return false;
        }

        if (!q && selectedItemFilter === "ALL") return true;

        return cls.items.some((item) => {
          if (selectedItemFilter !== "ALL" && item.itemName !== selectedItemFilter) {
            return false;
          }

          if (!q) return true;

          // Search matches class name, item name, size, color, or style
          if (cls.className.toLowerCase().includes(q)) return true;
          if (item.itemName.toLowerCase().includes(q)) return true;
          return item.rows.some(
            (r) =>
              r.size.toLowerCase().includes(q) ||
              r.color.toLowerCase().includes(q) ||
              (r.styleName && r.styleName.toLowerCase().includes(q))
          );
        });
      })
      .map((cls) => {
        if (!q && selectedItemFilter === "ALL") return cls;

        const matchingItems = cls.items
          .filter((item) => {
            if (selectedItemFilter !== "ALL" && item.itemName !== selectedItemFilter) {
              return false;
            }
            return true;
          })
          .map((item) => {
            if (!q) return item;

            const itemMatches =
              cls.className.toLowerCase().includes(q) ||
              item.itemName.toLowerCase().includes(q);

            const matchingRows = item.rows.filter(
              (r) =>
                itemMatches ||
                r.size.toLowerCase().includes(q) ||
                r.color.toLowerCase().includes(q) ||
                (r.styleName && r.styleName.toLowerCase().includes(q))
            );

            return {
              ...item,
              rows: matchingRows,
            };
          })
          .filter((item) => item.rows.length > 0);

        return {
          ...cls,
          items: matchingItems,
        };
      });
  }, [classCardsData, searchQuery, selectedClassFilter, selectedItemFilter]);

  // 3. Overall Order Requirement Aggregation (Consolidated Table)
  const overallRows = useMemo(() => {
    interface OverallRow {
      itemName: string;
      size: string;
      color: string;
      styleName: string | null;
      quantity: number;
    }

    const rowMap = new Map<string, OverallRow>();

    requirementItems.forEach((item) => {
      const itemName = item.item_name ? item.item_name.trim() : "Uniform Item";
      const styleName = getCleanStyleName(item.style_name);
      const color = formatClientColor(item.color);
      const size = (item.size || "Standard").trim();
      const quantity = item.quantity || 0;

      const key = `${itemName}__${size}__${color}__${styleName || "no_style"}`;
      const existing = rowMap.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        rowMap.set(key, {
          itemName,
          size,
          color,
          styleName,
          quantity,
        });
      }
    });

    const rows = Array.from(rowMap.values()).sort((a, b) => {
      const itemComp = a.itemName.localeCompare(b.itemName);
      if (itemComp !== 0) return itemComp;
      const sizeComp = compareSizes(a.size, b.size);
      if (sizeComp !== 0) return sizeComp;
      return a.color.localeCompare(b.color);
    });

    return rows;
  }, [requirementItems]);

  // Filtered overall rows
  const filteredOverallRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return overallRows.filter((row) => {
      if (selectedItemFilter !== "ALL" && row.itemName !== selectedItemFilter) {
        return false;
      }

      if (!q) return true;

      return (
        row.itemName.toLowerCase().includes(q) ||
        row.size.toLowerCase().includes(q) ||
        row.color.toLowerCase().includes(q) ||
        (row.styleName && row.styleName.toLowerCase().includes(q))
      );
    });
  }, [overallRows, searchQuery, selectedItemFilter]);

  const overallTotalPieces = useMemo(() => {
    return filteredOverallRows.reduce((sum, r) => sum + r.quantity, 0);
  }, [filteredOverallRows]);

  const hasAnyMeaningfulStyleOverall = useMemo(() => {
    return overallRows.some((r) => !!r.styleName);
  }, [overallRows]);

  // Expand / Collapse toggles
  const toggleClassExpansion = (className: string) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    classCardsData.forEach((c) => {
      allExpanded[c.className] = true;
    });
    setExpandedClasses(allExpanded);
  };

  const collapseAll = () => {
    setExpandedClasses({});
  };

  const isAllExpanded = useMemo(() => {
    if (classCardsData.length === 0) return false;
    return classCardsData.every((c) => expandedClasses[c.className]);
  }, [classCardsData, expandedClasses]);

  return (
    <div className="space-y-6">
      {/* 1. Header Information — Simple Client Language (Section 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">
            Stock Size Requirements
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Required uniform quantities based on the students and sizes in this order
            {orderNumber ? ` (${orderNumber})` : ""}
            {schoolName && (
              <span className="ml-1 text-slate-600 font-medium">— {schoolName}</span>
            )}
            .
          </p>
        </div>

        {/* View Switcher: [ Class Wise ] [ Overall Requirement ] (Section 12) */}
        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 w-full sm:w-auto justify-center">
          <button
            type="button"
            onClick={() => setViewMode("class_wise")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex-1 sm:flex-initial ${
              viewMode === "class_wise"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5 text-evenvibe-primary" />
            Class Wise
          </button>
          <button
            type="button"
            onClick={() => setViewMode("overall")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex-1 sm:flex-initial ${
              viewMode === "overall"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5 text-evenvibe-primary" />
            Overall Requirement
          </button>
        </div>
      </div>

      {/* 2. Top Summary Cards — Clean Client Labels (Section 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Students */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Students</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {summaryMetrics.totalStudents.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Classes */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-evenvibe-light flex items-center justify-center shrink-0">
              <GraduationCap className="h-5 w-5 text-evenvibe-primary" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Classes</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {summaryMetrics.classes}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Uniform Items */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-evenvibe-light flex items-center justify-center shrink-0">
              <Shirt className="h-5 w-5 text-evenvibe-primary" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Uniform Items</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {summaryMetrics.uniformItems}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Total Pieces */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-emerald-100 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-evenvibe-primary" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Pieces</p>
              <p className="text-2xl font-bold text-evenvibe-deep mt-0.5">
                {summaryMetrics.totalPieces.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Simple Client Filters (Section 13) */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50/90 p-3 rounded-lg border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search class, item, size or color..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white text-xs h-9 border-slate-200"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {viewMode === "class_wise" && (
            <select
              suppressHydrationWarning
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              aria-label="Filter by Class"
              className="h-9 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-40"
            >
              <option value="ALL">All Classes</option>
              {allUniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          )}

          <select
            suppressHydrationWarning
            value={selectedItemFilter}
            onChange={(e) => setSelectedItemFilter(e.target.value)}
            aria-label="Filter by Item"
            className="h-9 text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-40"
          >
            <option value="ALL">All Items</option>
            {allUniqueItems.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          {viewMode === "class_wise" && (
            <Button
              variant="outline"
              size="sm"
              onClick={isAllExpanded ? collapseAll : expandAll}
              className="h-9 text-xs border-slate-200 hover:bg-slate-50 gap-1.5 shrink-0"
            >
              {isAllExpanded ? (
                <>
                  <Shrink className="h-3.5 w-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Collapse All</span>
                </>
              ) : (
                <>
                  <Expand className="h-3.5 w-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Expand All</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 4. PRIMARY VIEW: CLASS-WISE (Section 3, 4, 7, 8, 9, 10, 14) */}
      {viewMode === "class_wise" && (
        <>
          {filteredClassCards.length === 0 ? (
            <Card className="border-slate-200 bg-white py-12 text-center">
              <CardContent className="space-y-3">
                <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-slate-800 text-sm">
                    No uniform size requirements are available for this order.
                  </h4>
                  {searchQuery && (
                    <p className="text-xs text-slate-500">
                      Try clearing your search or filter options.
                    </p>
                  )}
                </div>
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="text-xs"
                  >
                    Clear Search
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredClassCards.map((cls) => {
                const isExpanded = !!expandedClasses[cls.className];

                return (
                  <Card
                    key={cls.className}
                    className={`border transition-all overflow-hidden bg-white shadow-2xs ${
                      isExpanded
                        ? "border-emerald-300 ring-1 ring-emerald-400/20"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Class Card Header — Clean Business Format (Section 4 & 10) */}
                    <div
                      onClick={() => toggleClassExpansion(cls.className)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                        isExpanded ? "bg-slate-50/80 border-b border-slate-200" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-7 w-7 rounded-md flex items-center justify-center transition-transform ${
                            isExpanded
                              ? "bg-evenvibe-primary text-white rotate-90"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </div>

                        <div>
                          <h4 className="font-bold text-base text-slate-900 tracking-tight">
                            {cls.className}
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            {cls.studentCount} {cls.studentCount === 1 ? "Student" : "Students"} •{" "}
                            {cls.totalPieces} {cls.totalPieces === 1 ? "Piece" : "Pieces"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 sm:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-slate-600 h-8 px-3 hover:bg-slate-200/60 font-semibold"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClassExpansion(cls.className);
                          }}
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </Button>
                      </div>
                    </div>

                    {/* Class Details: Clean Item Tables (Section 3, 5, 6, 7, 8) */}
                    {isExpanded && (
                      <CardContent className="p-4 sm:p-5 space-y-5 bg-slate-50/30">
                        {cls.items.map((item) => (
                          <div
                            key={item.itemName}
                            className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden"
                          >
                            {/* Item Header */}
                            <div className="bg-slate-100/70 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Shirt className="h-4 w-4 text-evenvibe-deep" />
                                <h5 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                                  {item.itemName}
                                </h5>
                              </div>
                              <span className="text-xs text-slate-600 font-semibold">
                                Total: {formatPieces(item.totalPieces)}
                              </span>
                            </div>

                            {/* Clean Business Table: Desktop View */}
                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                    <th className="py-2.5 px-4 w-1/4">Size</th>
                                    {item.hasMeaningfulStyle && (
                                      <th className="py-2.5 px-4">Style</th>
                                    )}
                                    <th className="py-2.5 px-4">Color</th>
                                    <th className="py-2.5 px-4 text-right">Quantity</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {item.rows.map((row, idx) => (
                                    <tr
                                      key={`${row.size}-${row.color}-${row.styleName}-${idx}`}
                                      className="hover:bg-slate-50/70 transition-colors"
                                    >
                                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] border border-slate-200">
                                          Size {row.size}
                                        </span>
                                      </td>
                                      {item.hasMeaningfulStyle && (
                                        <td className="py-2.5 px-4 text-slate-700">
                                          {row.styleName ? (
                                            <Badge
                                              variant="secondary"
                                              className="bg-slate-100 text-slate-800 border-slate-200 text-[10px] font-normal"
                                            >
                                              {row.styleName}
                                            </Badge>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>
                                      )}
                                      <td className="py-2.5 px-4 font-medium text-slate-700">
                                        {row.color}
                                      </td>
                                      <td className="py-2.5 px-4 text-right font-bold text-slate-900 text-xs">
                                        {formatPieces(row.quantity)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-slate-50/90 font-bold border-t border-slate-200 text-slate-900">
                                    <td
                                      colSpan={item.hasMeaningfulStyle ? 3 : 2}
                                      className="py-2.5 px-4"
                                    >
                                      Total for {item.itemName}
                                    </td>
                                    <td className="py-2.5 px-4 text-right text-evenvibe-deep">
                                      {formatPieces(item.totalPieces)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Clean Business Table: Mobile Cards View */}
                            <div className="md:hidden space-y-2 p-3 bg-slate-50/50">
                              {item.rows.map((row, idx) => (
                                <MobileCard
                                  key={`mob-item-${row.size}-${row.color}-${row.styleName}-${idx}`}
                                  className="border border-slate-200 bg-white p-3 space-y-2"
                                >
                                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                                    <span className="font-bold text-sm text-slate-900">Size {row.size}</span>
                                    <span className="font-bold text-evenvibe-deep text-xs">
                                      {formatPieces(row.quantity)}
                                    </span>
                                  </div>
                                  {item.hasMeaningfulStyle && row.styleName && (
                                    <MobileCardField
                                      label="Style"
                                      value={
                                        <Badge
                                          variant="secondary"
                                          className="bg-slate-100 text-slate-800 border-slate-200 text-[10px] font-normal"
                                        >
                                          {row.styleName}
                                        </Badge>
                                      }
                                    />
                                  )}
                                  <MobileCardField label="Color" value={row.color} />
                                </MobileCard>
                              ))}

                              {/* Mobile Total Summary */}
                              <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center justify-between font-bold">
                                <span className="text-slate-700">Total for {item.itemName}:</span>
                                <span className="text-evenvibe-deep">{formatPieces(item.totalPieces)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. SECOND VIEW: OVERALL REQUIREMENT (Section 11 & 12) */}
      {viewMode === "overall" && (
        <Card className="border-slate-200 shadow-2xs bg-white overflow-hidden">
          <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-sm text-slate-900 tracking-tight">
                Overall Uniform Requirement
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Consolidated production requirements across all classes in this order.
              </p>
            </div>
            <Badge className="bg-evenvibe-light text-emerald-800 border border-emerald-200 font-bold text-xs px-2.5 py-1 self-start sm:self-center">
              Total: {formatPieces(overallTotalPieces)}
            </Badge>
          </div>

          <CardContent className="p-0">
            {filteredOverallRows.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No uniform size requirements match your filter criteria.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-3 px-4">Item</th>
                      <th className="py-3 px-4">Size</th>
                      {hasAnyMeaningfulStyleOverall && (
                        <th className="py-3 px-4">Style</th>
                      )}
                      <th className="py-3 px-4">Color</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOverallRows.map((row, idx) => (
                      <tr
                        key={`${row.itemName}-${row.size}-${row.color}-${row.styleName}-${idx}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {row.itemName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] border border-slate-200">
                            Size {row.size}
                          </span>
                        </td>
                        {hasAnyMeaningfulStyleOverall && (
                          <td className="py-3 px-4 text-slate-700">
                            {row.styleName ? (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-800 border-slate-200 text-[10px] font-normal"
                              >
                                {row.styleName}
                              </Badge>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {row.color}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 text-xs">
                          {formatPieces(row.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <td
                        colSpan={hasAnyMeaningfulStyleOverall ? 4 : 3}
                        className="py-3 px-4 text-sm"
                      >
                        Total Pieces Across All Items
                      </td>
                      <td className="py-3 px-4 text-right text-evenvibe-deep text-sm font-extrabold">
                        {formatPieces(overallTotalPieces)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden space-y-2.5 p-3 bg-slate-50/50">
                {filteredOverallRows.map((row, idx) => (
                  <MobileCard
                    key={`mob-overall-${row.itemName}-${row.size}-${row.color}-${row.styleName}-${idx}`}
                    className="border border-slate-200 bg-white"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="font-bold text-sm text-slate-900">{row.itemName}</span>
                      <span className="font-bold text-xs text-evenvibe-deep">
                        {formatPieces(row.quantity)}
                      </span>
                    </div>

                    <MobileCardField
                      label="Size"
                      value={
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs border border-slate-200">
                          Size {row.size}
                        </span>
                      }
                    />

                    {hasAnyMeaningfulStyleOverall && row.styleName && (
                      <MobileCardField
                        label="Style"
                        value={
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-800 border-slate-200 text-[10px] font-normal"
                          >
                            {row.styleName}
                          </Badge>
                        }
                      />
                    )}

                    <MobileCardField label="Color" value={row.color} />
                  </MobileCard>
                ))}

                {/* Mobile Overall Total Card */}
                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs flex items-center justify-between font-bold">
                  <span className="text-slate-800">Total Across All Items:</span>
                  <span className="text-evenvibe-deep text-sm">{formatPieces(overallTotalPieces)}</span>
                </div>
              </div>
            </>
          )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
