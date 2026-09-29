"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { DEFAULT_STUDENT_SIZES, isPositiveWholeNumber } from "@/lib/constants/studentSizes";
import { StudentSizeSelector } from "@/components/students/StudentSizeSelector";
import { SizeCollectionFormValues, SizeHistoryEntry, LastYearSizesMap } from "@/app/(school)/school/sizes/schema";
import { ActiveStyleItem } from "@/app/(school)/school/sizes/actions";
import { saveAdminStudentSizes, ConfigItem } from "./actions";
import { Loader2, AlertCircle, CheckCircle2, Clock, History, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeIST } from "@/lib/utils";
import { formatAcademicYear, DEFAULT_ACADEMIC_YEAR, getPreviousAcademicYear } from "@/lib/constants/academicYear";

interface AdminStudentData {
  id: string;
  student_name: string;
  class_name: string;
  section?: string;
  admission_number?: string;
  gender?: string | null;
  school_id?: string;
}

interface AdminSizeRecord {
  id?: string;
  academic_year?: string;
  dynamic_sizes?: Record<string, string>;
  dynamic_styles?: Record<string, { style_id?: string; style_name?: string; color?: string | null }>;
  is_complete?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AdminSizeFormProps {
  student?: AdminStudentData;
  activeStyles?: ActiveStyleItem[];
  sizeRecord: AdminSizeRecord | null;
  lastYearSizes?: LastYearSizesMap;
  sizeHistory?: SizeHistoryEntry[];
  activeAcademicYear?: string;
  previousAcademicYear?: string;
  onSuccess?: () => void;
  // Backward compatibility props
  studentId?: string;
  config?: {
    id: string;
    items: ConfigItem[];
  };
}

function computeInitialState(
  distinctItems: string[],
  applicableStyles: ActiveStyleItem[],
  sizeRecord: AdminSizeRecord | null
) {
  const recordSizes = sizeRecord?.dynamic_sizes || {};
  const recordStyles = sizeRecord?.dynamic_styles || {};

  const initialStyles: Record<string, string> = {};
  const initialSizes: Record<string, string> = {};
  const initialColors: Record<string, string> = {};

  distinctItems.forEach((itemName) => {
    const stylesForItem = applicableStyles.filter(
      (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
    );

    if (stylesForItem.length === 0) return;

    let matchedStyleId = "";
    for (const [key, st] of Object.entries(recordStyles)) {
      if (stylesForItem.some((s) => s.id === st.style_id || s.style_name === st.style_name)) {
        const found = stylesForItem.find((s) => s.id === st.style_id || s.style_name === st.style_name);
        if (found) {
          matchedStyleId = found.id;
          if (recordSizes[key] && !initialSizes[found.id]) {
            initialSizes[found.id] = recordSizes[key];
          }
          if (st.color) {
            initialColors[found.id] = st.color;
          }
        }
        break;
      }
    }

    if (!matchedStyleId) {
      matchedStyleId = stylesForItem[0].id;
    }

    initialStyles[itemName] = matchedStyleId;

    const activeStyle = stylesForItem.find((s) => s.id === matchedStyleId) || stylesForItem[0];
    if (recordSizes[activeStyle.id]) {
      initialSizes[activeStyle.id] = recordSizes[activeStyle.id];
    } else {
      for (const val of Object.values(recordSizes)) {
        if (val && activeStyle.available_sizes.includes(val) && !initialSizes[activeStyle.id]) {
          initialSizes[activeStyle.id] = val;
          break;
        }
      }
    }

    if (recordStyles[activeStyle.id]?.color) {
      initialColors[activeStyle.id] = recordStyles[activeStyle.id].color!;
    }
  });

  return { initialStyles, initialSizes, initialColors };
}

export function AdminSizeForm({
  student,
  activeStyles = [],
  sizeRecord,
  lastYearSizes = {},
  sizeHistory = [],
  activeAcademicYear,
  previousAcademicYear,
  onSuccess,
  studentId,
  config,
}: AdminSizeFormProps) {
  const currentStudentId = student?.id || studentId || "";
  const currentClassName = student?.class_name || "";
  const currentGender = student?.gender || "Male";

  const displayActiveYear = activeAcademicYear || sizeRecord?.academic_year || DEFAULT_ACADEMIC_YEAR;
  const displayPrevYear = previousAcademicYear || getPreviousAcademicYear(displayActiveYear);

  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isComplete = Boolean(sizeRecord?.is_complete);

  // 1. Resolve active styles matching student class and gender
  const applicableStyles = useMemo(() => {
    return activeStyles.filter((st) => {
      const classMatch = st.classes.includes(currentClassName);
      const genderMatch =
        !st.gender ||
        st.gender === "All" ||
        st.gender.toLowerCase() === currentGender.toLowerCase();
      return classMatch && genderMatch;
    });
  }, [activeStyles, currentClassName, currentGender]);

  // 2. Extract distinct uniform items
  const configItems = config?.items;
  const distinctItems = useMemo(() => {
    const set = new Set<string>();
    applicableStyles.forEach((s) => set.add(s.item_name.trim()));

    if (applicableStyles.length === 0 && configItems) {
      configItems.forEach((i) => set.add(i.item_name.trim()));
    }

    return Array.from(set).sort((a, b) => {
      const styleA = applicableStyles.find((s) => s.item_name.toLowerCase() === a.toLowerCase());
      const styleB = applicableStyles.find((s) => s.item_name.toLowerCase() === b.toLowerCase());
      const orderA = styleA?.sort_order ?? 99;
      const orderB = styleB?.sort_order ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
  }, [applicableStyles, configItems]);

  // 3. Compute initial state
  const initialState = useMemo(() => {
    return computeInitialState(distinctItems, applicableStyles, sizeRecord);
  }, [distinctItems, applicableStyles, sizeRecord]);

  // 4. Form state
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>(initialState.initialStyles);
  const [dynamicSizes, setDynamicSizes] = useState<Record<string, string>>(initialState.initialSizes);
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>(initialState.initialColors);
  const [manualLastYearSizes, setManualLastYearSizes] = useState<Record<string, string>>({});

  const handleStyleChange = (itemName: string, newStyleId: string) => {
    setSelectedStyles((prev) => ({ ...prev, [itemName]: newStyleId }));

    const newStyle = applicableStyles.find((s) => s.id === newStyleId);
    if (newStyle) {
      const currentSize = dynamicSizes[newStyleId] || "";
      if (
        currentSize &&
        !newStyle.available_sizes.includes(currentSize) &&
        !(DEFAULT_STUDENT_SIZES as readonly string[]).includes(currentSize) &&
        !isPositiveWholeNumber(currentSize)
      ) {
        setDynamicSizes((prev) => ({ ...prev, [newStyleId]: "" }));
      }
    }
  };

  const handleSizeChange = (styleId: string, size: string) => {
    setDynamicSizes((prev) => ({
      ...prev,
      [styleId]: size === "__none__" ? "" : size,
    }));
  };

  const handleManualLastYearSizeChange = (itemName: string, styleId: string, size: string) => {
    const key = `${itemName.trim()}__${styleId}`;
    setManualLastYearSizes((prev) => ({
      ...prev,
      [key]: size === "__none__" ? "" : size,
    }));
  };

  // Check if any item lacks an active style
  const itemsWithoutStyles = useMemo(() => {
    return distinctItems.filter((itemName) => {
      const styles = applicableStyles.filter(
        (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
      );
      return styles.length === 0;
    });
  }, [distinctItems, applicableStyles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentStudentId) {
      toast.error("Student ID is missing.");
      return;
    }

    if (distinctItems.length === 0) {
      toast.error("No uniform items configured for this student.");
      return;
    }

    if (itemsWithoutStyles.length > 0) {
      toast.error(
        `Uniform style is not configured for ${itemsWithoutStyles.join(", ")} in Class ${currentClassName}. Please configure styles first.`
      );
      return;
    }

    // Client-side strict validation before submitting
    const payloadSizes: Record<string, string> = {};
    const payloadStyles: Record<string, { style_id: string; style_name: string; color?: string | null }> = {};
    const payloadManualLastYear: Record<string, string> = {};

    for (const itemName of distinctItems) {
      const stylesForItem = applicableStyles.filter(
        (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
      );

      const styleId = selectedStyles[itemName] || stylesForItem[0]?.id;
      const selectedStyle = stylesForItem.find((s) => s.id === styleId);

      if (!selectedStyle) {
        toast.error(`Please select a uniform style for ${itemName}.`);
        return;
      }

      const sizeVal = dynamicSizes[selectedStyle.id];

      if (selectedStyle.is_required) {
        if (!sizeVal || sizeVal.trim() === "" || sizeVal === "__none__") {
          toast.error(`Please select a size for required item: ${selectedStyle.style_name} (${itemName}).`);
          return;
        }
      }

      // Check configured colors for this style & student's class
      const configuredColors = (selectedStyle.colors || [])
        .filter((c) => c.is_active !== false && c.class_name.trim().toLowerCase() === currentClassName.trim().toLowerCase())
        .map((c) => c.color_name.trim());

      const colorVal = selectedColors[selectedStyle.id];

      if (configuredColors.length > 0) {
        if ((selectedStyle.is_required || (sizeVal && sizeVal.trim() !== "" && sizeVal !== "__none__")) && (!colorVal || colorVal.trim() === "")) {
          toast.error(`Please select a color for ${selectedStyle.style_name} (${itemName}).`);
          return;
        }
      }

      if (sizeVal && sizeVal.trim() !== "" && sizeVal !== "__none__") {
        payloadSizes[selectedStyle.id] = sizeVal.trim();
        payloadStyles[selectedStyle.id] = {
          style_id: selectedStyle.id,
          style_name: selectedStyle.style_name,
          color: (configuredColors.length > 0 && colorVal) ? colorVal.trim() : null,
        };
      }

      // Check if manual last year size was entered for this item + style (only when no previous record exists)
      const itemKey = itemName.trim().toLowerCase();
      const styleKey = selectedStyle.id;
      const styleNameKey = selectedStyle.style_name ? selectedStyle.style_name.trim().toLowerCase() : "";
      const existingLastYear =
        lastYearSizes[`${itemKey}__${styleKey}`] ||
        (styleNameKey ? lastYearSizes[`${itemKey}__${styleNameKey}`] : null) ||
        lastYearSizes[styleKey] ||
        null;

      if (!existingLastYear) {
        const manualVal = manualLastYearSizes[`${itemName.trim()}__${selectedStyle.id}`];
        if (manualVal && manualVal.trim() !== "" && manualVal !== "__none__") {
          payloadManualLastYear[`${itemName.trim()}__${selectedStyle.id}`] = manualVal.trim();
        }
      }
    }

    setIsLoading(true);

    const data: SizeCollectionFormValues = {
      student_id: currentStudentId,
      uniform_type: UNIFORM_TYPES.REGULAR,
      dynamic_sizes: payloadSizes,
      dynamic_styles: payloadStyles,
      manual_last_year_sizes: payloadManualLastYear,
      is_dynamic_only: true,
    };

    const result = await saveAdminStudentSizes(data);

    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Uniform sizes and colors saved successfully.");
      onSuccess?.();
    }
  };

  return (
    <div className="space-y-4 mt-2">
      {/* Status & History Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">Collection Status</span>
            <Badge
              variant="outline"
              className={
                isComplete
                  ? "bg-evenvibe-light text-evenvibe-deep border-emerald-200 font-semibold"
                  : "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
              }
            >
              {isComplete ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Pending
                </span>
              )}
            </Badge>

            <Badge variant="outline" className="bg-evenvibe-light border-evenvibe-light text-evenvibe-deep text-xs font-semibold px-2 py-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Academic Year: {formatAcademicYear(displayActiveYear)}
            </Badge>
          </div>
          {sizeRecord?.created_at && (
            <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4">
              <span>First collected: <strong className="text-slate-700">{formatDateTimeIST(sizeRecord.created_at)}</strong></span>
              {sizeRecord.updated_at && (
                <span>Last updated: <strong className="text-slate-700">{formatDateTimeIST(sizeRecord.updated_at)}</strong></span>
              )}
            </div>
          )}
        </div>

        {/* Existing Snapshot Summary */}
        {sizeRecord?.dynamic_styles && Object.keys(sizeRecord.dynamic_styles).length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {Object.entries(sizeRecord.dynamic_styles).map(([styleId, st]) => {
              const currentSize = sizeRecord.dynamic_sizes?.[styleId] || "";
              return (
                <Badge
                  key={styleId}
                  variant="outline"
                  className="text-[10px] bg-white border-slate-200 text-slate-700 font-medium flex items-center gap-1"
                >
                  <span>{st.style_name}: Size {currentSize}</span>
                  {st.color && (
                    <span className="text-blue-700 font-semibold">• {st.color}</span>
                  )}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {distinctItems.length > 0 ? (
          <>
            {itemsWithoutStyles.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Style configuration required:</span>
                  <p className="mt-0.5">
                    Uniform style is not configured for:{" "}
                    <span className="font-bold">{itemsWithoutStyles.join(", ")}</span> in Class {currentClassName}.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3.5">
              {distinctItems.map((itemName) => {
                const stylesForItem = applicableStyles.filter(
                  (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
                );
                const hasStyle = stylesForItem.length > 0;

                const selectedStyleId = selectedStyles[itemName] || stylesForItem[0]?.id;
                const currentStyle = stylesForItem.find((s) => s.id === selectedStyleId) || stylesForItem[0];

                const isMultipleStyles = stylesForItem.length > 1;
                const isRequired = currentStyle?.is_required ?? true;
                const availableSizes = currentStyle?.available_sizes || [];
                const currentSizeVal = currentStyle ? dynamicSizes[currentStyle.id] || "" : "";

                // Configured colors for student's exact class
                const styleColorsForClass = (currentStyle?.colors || [])
                  .filter((c) => c.is_active !== false && c.class_name.trim().toLowerCase() === currentClassName.trim().toLowerCase())
                  .map((c) => c.color_name.trim());

                // Derive Last Year Size from previous academic year records (strictly read-only)
                const lastYearSize = currentStyle
                  ? lastYearSizes[currentStyle.id] || lastYearSizes[itemName.trim().toLowerCase()] || null
                  : null;

                return (
                  <div
                    key={itemName}
                    className={`rounded-lg border p-4 space-y-3.5 transition-colors ${
                      hasStyle
                        ? "bg-white border-slate-200 shadow-xs"
                        : "bg-amber-50/40 border-amber-200/80"
                    }`}
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {currentStyle ? `${itemName} — ${currentStyle.style_name}` : itemName}
                        </span>
                        {hasStyle && (
                          isRequired ? (
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 font-medium">
                              Required *
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 font-medium">
                              Optional
                            </Badge>
                          )
                        )}
                      </div>

                      {hasStyle && !isMultipleStyles && (
                        <Badge className="bg-evenvibe-light text-evenvibe-deep border border-emerald-300 font-semibold text-xs">
                          {currentStyle.style_name}
                        </Badge>
                      )}
                    </div>

                    {hasStyle ? (
                      <div className="space-y-3">
                        {/* Style Selector when multiple active styles exist */}
                        {isMultipleStyles && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                              <span>Select Style</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                {stylesForItem.length} styles available
                              </span>
                            </Label>
                            <Select
                              value={currentStyle.id}
                              onValueChange={(val) => {
                                if (val) handleStyleChange(itemName, val);
                              }}
                            >
                              <SelectTrigger className="bg-slate-50/70 border-slate-200 text-xs">
                                <SelectValue placeholder="Select Style" />
                              </SelectTrigger>
                              <SelectContent>
                                {stylesForItem.map((st) => (
                                  <SelectItem key={st.id} value={st.id} className="text-xs">
                                    {st.style_name} {st.is_required ? "(Required)" : "(Optional)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Last Year Size - DUAL CASE: Read-Only when history exists, Optional Manual Selector when no history exists */}
                        {lastYearSize ? (
                          <div className="bg-slate-50/90 border border-slate-200 rounded-md p-2.5 flex items-center justify-between text-xs">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-700 block">Last Year Size</span>
                              <span className="text-[11px] text-slate-500">
                                {formatAcademicYear(displayPrevYear)} • Historical • Read Only
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-2.5 py-0.5 bg-white border border-slate-300 text-slate-900 rounded font-bold shadow-2xs">
                                {lastYearSize}
                              </span>
                              <span className="text-[10px] text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                                Read Only
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5 p-3 rounded-md bg-slate-50/70 border border-slate-200">
                            <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                              <span>Last Year Size (Optional)</span>
                              <span className="text-[11px] text-slate-500">
                                {formatAcademicYear(displayPrevYear)} Baseline
                              </span>
                            </Label>
                            <StudentSizeSelector
                              value={manualLastYearSizes[`${itemName.trim()}__${currentStyle.id}`] || ""}
                              onChange={(sz) => handleManualLastYearSizeChange(itemName, currentStyle.id, sz)}
                              itemName={`${itemName} Last Year`}
                              isRequired={false}
                              configuredSizes={availableSizes}
                            />
                            <p className="text-[11px] text-slate-500">
                              No previous-year record found. Enter the known previous-year size if available.
                            </p>
                          </div>
                        )}

                        {/* Current Year Size Selector */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>Current Year Size {isRequired && <span className="text-status-error">*</span>}</span>
                            <span className="text-[11px] text-evenvibe-primary font-medium">
                              {formatAcademicYear(displayActiveYear)} Requirement
                            </span>
                          </Label>
                          <StudentSizeSelector
                            value={currentSizeVal}
                            onChange={(sz) => handleSizeChange(currentStyle.id, sz)}
                            itemName={itemName}
                            isRequired={isRequired}
                            configuredSizes={availableSizes}
                          />
                        </div>

                        {/* Color Selector - CRITICAL: ONLY rendered when Admin configured colors for this exact class/style */}
                        {styleColorsForClass.length > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                              <span>Color {isRequired && <span className="text-status-error">*</span>}</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                Class {currentClassName} ({styleColorsForClass.length} configured)
                              </span>
                            </Label>
                            <Select
                              value={selectedColors[currentStyle.id] || ""}
                              onValueChange={(val) => {
                                setSelectedColors((prev) => ({ ...prev, [currentStyle.id]: val || "" }));
                              }}
                            >
                              <SelectTrigger className="bg-slate-50/70 border-slate-200 text-xs">
                                <SelectValue placeholder="Select Color" />
                              </SelectTrigger>
                              <SelectContent>
                                {styleColorsForClass.map((col) => (
                                  <SelectItem key={col} value={col} className="text-xs">
                                    {col}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-100/60 p-2.5 rounded border border-amber-200 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Uniform style is not configured for this item and class.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Size History (Actual Student Growth) - NO PREDICTION */}
            {sizeHistory && sizeHistory.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-600" />
                    <span>Actual Size History ({sizeHistory.length} record{sizeHistory.length > 1 ? "s" : ""})</span>
                  </div>
                  {showHistory ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </button>
                {showHistory && (
                  <div className="p-3 pt-0 border-t border-slate-200/60 divide-y divide-slate-200/60">
                    {distinctItems.map((item) => {
                      const itemRecords = sizeHistory.filter(
                        (h) => h.item_name.trim().toLowerCase() === item.trim().toLowerCase()
                      );
                      if (itemRecords.length === 0) return null;
                      return (
                        <div key={item} className="py-2.5 first:pt-2 last:pb-1 space-y-1">
                          <span className="font-semibold text-slate-800 text-xs">{item}:</span>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {itemRecords.map((rec) => (
                              <div
                                key={rec.id}
                                className="inline-flex items-center gap-1.5 text-[11px] bg-white border border-slate-200 rounded-md px-2 py-1 shadow-2xs"
                              >
                                <span className="font-medium text-slate-600">{formatAcademicYear(rec.academic_year)}:</span>
                                <strong className="text-slate-900 font-bold">Size {rec.size}</strong>
                                {rec.color && (
                                  <span className="text-blue-700 font-medium text-[10px]">({rec.color})</span>
                                )}
                                {rec.source_type === "manual_baseline" && (
                                  <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 font-semibold">
                                    Baseline
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
              <Button
                type="submit"
                disabled={isLoading || itemsWithoutStyles.length > 0}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs h-9 px-4"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Uniform Sizes
              </Button>
            </div>
          </>
        ) : (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-center text-xs">
            No uniform styles configured for Class {currentClassName}.
          </div>
        )}
      </form>
    </div>
  );
}
