"use client";

import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { DEFAULT_STUDENT_SIZES, isPositiveWholeNumber } from "@/lib/constants/studentSizes";
import { StudentSizeSelector } from "@/components/students/StudentSizeSelector";
import { StudentWithSize, SizeCollectionFormValues } from "@/app/(school)/school/sizes/schema";
import { saveStudentSizes, AllConfigItem, ActiveStyleItem } from "@/app/(school)/school/sizes/actions";
import { Loader2, AlertCircle, Shirt, History, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeIST } from "@/lib/utils";
import { formatAcademicYear, DEFAULT_ACADEMIC_YEAR, getPreviousAcademicYear } from "@/lib/constants/academicYear";

interface SizeFormDialogProps {
  student: StudentWithSize;
  configurations: AllConfigItem[];
  activeStyles?: ActiveStyleItem[];
  trigger: React.ReactElement;
}

export function SizeFormDialog({
  student,
  configurations,
  activeStyles = [],
  trigger,
}: SizeFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isEdit = !!student.size_record;

  const displayActiveYear = student.size_record?.academic_year || DEFAULT_ACADEMIC_YEAR;
  const displayPrevYear = getPreviousAcademicYear(displayActiveYear);

  // 1. Resolve active styles matching student class and gender
  const applicableStyles = useMemo(() => {
    return activeStyles.filter((st) => {
      const classMatch = st.classes.includes(student.class_name);
      const genderMatch =
        !st.gender ||
        st.gender === "All" ||
        st.gender.toLowerCase() === (student.gender || "Male").toLowerCase();
      return classMatch && genderMatch;
    });
  }, [activeStyles, student.class_name, student.gender]);

  // 2. Extract distinct uniform items
  const distinctItems = useMemo(() => {
    const set = new Set<string>();
    applicableStyles.forEach((s) => set.add(s.item_name.trim()));
    
    // Also include any items from configurations to detect missing styles
    const config = configurations.find(
      (c) => c.gender === student.gender && c.classes.includes(student.class_name)
    );
    config?.items?.forEach((i) => set.add(i.item_name.trim()));

    return Array.from(set).sort((a, b) => {
      // Prioritize items present in applicableStyles by sort_order
      const styleA = applicableStyles.find((s) => s.item_name.toLowerCase() === a.toLowerCase());
      const styleB = applicableStyles.find((s) => s.item_name.toLowerCase() === b.toLowerCase());
      const orderA = styleA?.sort_order ?? 99;
      const orderB = styleB?.sort_order ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
  }, [applicableStyles, configurations, student.gender, student.class_name]);

  // 3. Form state: which style is selected for each item, and what size is selected
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>({});
  const [dynamicSizes, setDynamicSizes] = useState<Record<string, string>>({});
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [manualLastYearSizes, setManualLastYearSizes] = useState<Record<string, string>>({});

  // 4. Initialize form state based on student size record
  const initForm = useCallback(() => {
    const recordSizes = student.size_record?.dynamic_sizes || {};
    const recordStyles = student.size_record?.dynamic_styles || {};

    const initialStyles: Record<string, string> = {};
    const initialSizes: Record<string, string> = {};
    const initialColors: Record<string, string> = {};

    distinctItems.forEach((itemName) => {
      const stylesForItem = applicableStyles.filter(
        (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
      );

      if (stylesForItem.length === 0) return;

      // Check if student has a recorded style for this item
      let matchedStyleId = "";
      for (const [key, st] of Object.entries(recordStyles)) {
        if (stylesForItem.some((s) => s.id === st.style_id || s.style_name === st.style_name)) {
          const found = stylesForItem.find((s) => s.id === st.style_id || s.style_name === st.style_name);
          if (found) {
            matchedStyleId = found.id;
            // Also grab size if keyed by legacy key
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

      // If no recorded style, default
      if (!matchedStyleId) {
        matchedStyleId = stylesForItem[0].id;
      }

      initialStyles[itemName] = matchedStyleId;

      // Size resolution for selected style
      const activeStyle = stylesForItem.find((s) => s.id === matchedStyleId) || stylesForItem[0];
      if (recordSizes[activeStyle.id]) {
        initialSizes[activeStyle.id] = recordSizes[activeStyle.id];
      } else {
        // Check if any record size matches the style's available sizes
        for (const val of Object.values(recordSizes)) {
          if (val && activeStyle.available_sizes.includes(val) && !initialSizes[activeStyle.id]) {
            initialSizes[activeStyle.id] = val;
            break;
          }
        }
      }

      // Also check if recordStyles has color stored under activeStyle.id
      if (recordStyles[activeStyle.id]?.color) {
        initialColors[activeStyle.id] = recordStyles[activeStyle.id].color!;
      }
    });

    setSelectedStyles(initialStyles);
    setDynamicSizes(initialSizes);
    setSelectedColors(initialColors);
    setManualLastYearSizes({});
  }, [student.size_record, distinctItems, applicableStyles]);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      initForm();
    }
    setOpen(newOpen);
  };

  const handleStyleChange = (itemName: string, newStyleId: string) => {
    setSelectedStyles((prev) => ({ ...prev, [itemName]: newStyleId }));

    // Verify if current size is valid for the new style or standard student sizes
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

  // Check if any item lacks an active applicable style
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

    if (distinctItems.length === 0) {
      toast.error("No uniform items configured for this class.");
      return;
    }

    if (itemsWithoutStyles.length > 0) {
      toast.error(
        `Uniform style is not configured for ${itemsWithoutStyles.join(", ")} in Class ${student.class_name}. Please configure styles in Admin first.`
      );
      return;
    }

    // Strict validation: Required styles MUST have a size and color (if configured for this class)
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
        .filter((c) => c.is_active !== false && c.class_name.trim().toLowerCase() === student.class_name.trim().toLowerCase())
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
        student.last_year_sizes?.[`${itemKey}__${styleKey}`] ||
        (styleNameKey ? student.last_year_sizes?.[`${itemKey}__${styleNameKey}`] : null) ||
        student.last_year_sizes?.[styleKey] ||
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
      student_id: student.id,
      uniform_type: UNIFORM_TYPES.REGULAR,
      dynamic_sizes: payloadSizes,
      dynamic_styles: payloadStyles,
      manual_last_year_sizes: payloadManualLastYear,
      is_dynamic_only: true,
    };

    const result = await saveStudentSizes(data);

    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Uniform sizes and colors saved successfully.");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="h-5 w-5 text-evenvibe-primary" />
              {isEdit ? "Edit Uniform Sizes" : "Collect Uniform Sizes"}
            </DialogTitle>
            <Badge variant="outline" className="bg-evenvibe-light border-evenvibe-light text-evenvibe-deep text-xs font-semibold px-2 py-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Academic Year: {formatAcademicYear(displayActiveYear)}
            </Badge>
          </div>
          <DialogDescription>
            {student.student_name} • Class {student.class_name} • Sec {student.section} • Adm No {student.admission_number}
            {student.gender ? ` • ${student.gender}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isEdit && student.size_record && (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-1.5 mt-2">
            <div className="font-semibold text-slate-800">Size & Style History</div>
            <div className="flex items-center justify-between text-slate-600">
              <span>First collected:</span>
              <span className="font-medium text-slate-900">{formatDateTimeIST(student.size_record.created_at)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Last updated:</span>
              <span className="font-medium text-slate-900">{formatDateTimeIST(student.size_record.updated_at)}</span>
            </div>
            {student.size_record.dynamic_styles && Object.keys(student.size_record.dynamic_styles).length > 0 && (
              <div className="pt-1 border-t border-slate-200/60 mt-1">
                <span className="text-slate-500 block mb-0.5">Active Styles Snapshot:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(student.size_record.dynamic_styles).map(([itemId, st]) => (
                    <Badge key={itemId} variant="outline" className="text-[10px] bg-white border-slate-200 font-medium flex items-center gap-1">
                      <span>{st.style_name}</span>
                      {st.color && (
                        <span className="text-blue-700 font-semibold">• {st.color}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {distinctItems.length > 0 ? (
            <>
              {itemsWithoutStyles.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Style configuration required:</span>
                    <p className="mt-0.5">
                      Uniform style is not configured for:{" "}
                      <span className="font-bold">{itemsWithoutStyles.join(", ")}</span> in Class {student.class_name}. Please configure styles in Admin to measure these items.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {distinctItems.map((itemName) => {
                  const stylesForItem = applicableStyles.filter(
                    (s) => s.item_name.trim().toLowerCase() === itemName.toLowerCase()
                  );
                  const hasStyle = stylesForItem.length > 0;

                  // Selected style
                  const selectedStyleId = selectedStyles[itemName] || stylesForItem[0]?.id;
                  const currentStyle = stylesForItem.find((s) => s.id === selectedStyleId) || stylesForItem[0];

                  const isMultipleStyles = stylesForItem.length > 1;
                  const isRequired = currentStyle?.is_required ?? true;
                  const availableSizes = currentStyle?.available_sizes || [];
                  const currentSizeVal = currentStyle ? dynamicSizes[currentStyle.id] || "" : "";
                  const styleColorsForClass = (currentStyle?.colors || [])
                    .filter((c) => c.is_active !== false && c.class_name.trim().toLowerCase() === student.class_name.trim().toLowerCase())
                    .map((c) => c.color_name.trim());

                  const itemKey = itemName.trim().toLowerCase();
                  const styleKey = currentStyle?.id;
                  const styleNameKey = currentStyle?.style_name ? currentStyle.style_name.trim().toLowerCase() : "";

                  const lastYearSize = currentStyle
                    ? (student.last_year_sizes?.[`${itemKey}__${styleKey}`] ||
                       (styleNameKey ? student.last_year_sizes?.[`${itemKey}__${styleNameKey}`] : null) ||
                       student.last_year_sizes?.[styleKey] ||
                       null)
                    : null;

                  return (
                    <div
                      key={itemName}
                      className={`rounded-lg border p-3.5 space-y-3 transition-colors ${
                        hasStyle
                          ? "bg-white border-slate-200 shadow-xs"
                          : "bg-amber-50/40 border-amber-200/80"
                      }`}
                    >
                      {/* Item Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{itemName}</span>
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

                        {/* Single Style Badge */}
                        {hasStyle && !isMultipleStyles && (
                          <Badge className="bg-evenvibe-light text-evenvibe-deep border border-emerald-300 font-semibold text-xs">
                            {currentStyle.style_name}
                          </Badge>
                        )}
                      </div>

                      {hasStyle ? (
                        <div className="space-y-2.5">
                          {/* Style Selector when multiple active styles exist */}
                          {isMultipleStyles && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
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
                              <Label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
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
                            <Label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
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

                          {/* Color Selector - ONLY when Admin configured colors for this exact class */}
                          {styleColorsForClass.length > 0 && (
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                                <span>Color {isRequired && <span className="text-status-error">*</span>}</span>
                                <span className="text-[11px] text-slate-400 font-normal">
                                  Class {student.class_name} ({styleColorsForClass.length} configured)
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
              {student.size_history && student.size_history.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/60 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-slate-600" />
                      <span>Actual Size History ({student.size_history.length} record{student.size_history.length > 1 ? "s" : ""})</span>
                    </div>
                    {showHistory ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {showHistory && (
                    <div className="p-3 pt-0 border-t border-slate-200/60 divide-y divide-slate-200/60">
                      {distinctItems.map((item) => {
                        const itemRecords = (student.size_history || []).filter(
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

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || itemsWithoutStyles.length > 0}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Sizes
                </Button>
              </div>
            </>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-800">
                <p className="font-medium text-lg">No uniform styles configured for this class.</p>
                <p className="text-sm mt-1">Please create Uniform Styles in Admin to collect sizes for Class {student.class_name}.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
