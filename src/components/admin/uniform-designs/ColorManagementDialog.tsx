"use client";

import React, { useState, useMemo, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, Plus, X, Loader2, AlertCircle, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { UniformStyleWithDetails } from "@/types/database";
import { saveStyleColors } from "@/app/(admin)/admin/uniform-designs/actions";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

export const COMMON_COLOR_SUGGESTIONS = [
  "Red",
  "Green",
  "Blue",
  "Yellow",
  "Navy Blue",
  "White",
  "Black",
  "Maroon",
  "Grey",
  "Sky Blue",
  "Royal Blue",
  "Bottle Green",
];

interface SelectedSchool {
  id: string;
  name: string;
}

interface ColorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSchool: SelectedSchool;
  styles: UniformStyleWithDetails[];
  initialStyleId?: string | null;
  onSaved: (styleId: string, updatedColors: UniformStyleWithDetails["colors"]) => void;
}

function getInitialClassColors(styleObj?: UniformStyleWithDetails | null) {
  if (!styleObj) return {};
  const grouped: Record<string, string[]> = {};
  (styleObj.colors || []).forEach((c) => {
    if (!grouped[c.class_name]) grouped[c.class_name] = [];
    if (!grouped[c.class_name].some((x) => x.toLowerCase() === c.color_name.toLowerCase())) {
      grouped[c.class_name].push(c.color_name);
    }
  });
  return grouped;
}

interface ModalBodyProps {
  selectedSchool: SelectedSchool;
  styles: UniformStyleWithDetails[];
  initialStyleId?: string | null;
  onSaved: (styleId: string, updatedColors: UniformStyleWithDetails["colors"]) => void;
  onClose: () => void;
}

function ColorManagementModalBody({
  selectedSchool,
  styles,
  initialStyleId,
  onSaved,
  onClose,
}: ModalBodyProps) {
  const defaultStyleId = useMemo(() => {
    if (initialStyleId && styles.some((s) => s.id === initialStyleId)) {
      return initialStyleId;
    }
    return styles[0]?.id || "";
  }, [initialStyleId, styles]);

  const [selectedStyleId, setSelectedStyleId] = useState<string>(defaultStyleId);
  const [selectedClassTarget, setSelectedClassTarget] = useState<string>("all");
  const [customColorInput, setCustomColorInput] = useState<string>("" );
  const [classColors, setClassColors] = useState<Record<string, string[]>>(() => {
    const initialStyle = styles.find((s) => s.id === defaultStyleId);
    return getInitialClassColors(initialStyle);
  });
  const [isSaving, startSaving] = useTransition();

  // Find currently active style object
  const currentStyle = useMemo(() => {
    return styles.find((s) => s.id === selectedStyleId) || null;
  }, [styles, selectedStyleId]);

  // Sorted applicable classes for current style
  const applicableClasses = useMemo(() => {
    if (!currentStyle) return [];
    return [...(currentStyle.classes || [])].sort((a, b) => {
      const idxA = STANDARD_CLASSES.indexOf(a);
      const idxB = STANDARD_CLASSES.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });
  }, [currentStyle]);

  const handleSelectStyle = (newStyleId: string | null) => {
    if (!newStyleId) return;
    setSelectedStyleId(newStyleId);
    setSelectedClassTarget("all");
    setCustomColorInput("");
    const st = styles.find((s) => s.id === newStyleId);
    setClassColors(getInitialClassColors(st));
  };

  // Target classes to apply new color to
  const effectiveTargetClasses = useMemo(() => {
    if (selectedClassTarget === "all") return applicableClasses;
    return [selectedClassTarget];
  }, [selectedClassTarget, applicableClasses]);

  const handleAddColor = (colorName: string) => {
    const trimmed = colorName.trim();
    if (!trimmed) return;

    if (!currentStyle || applicableClasses.length === 0) {
      toast.error("No applicable classes available to assign colors.");
      return;
    }

    setClassColors((prev) => {
      const next = { ...prev };
      let addedAny = false;

      effectiveTargetClasses.forEach((cls) => {
        const existing = next[cls] || [];
        const alreadyExists = existing.some(
          (c) => c.toLowerCase() === trimmed.toLowerCase()
        );
        if (!alreadyExists) {
          next[cls] = [...existing, trimmed];
          addedAny = true;
        }
      });

      if (!addedAny) {
        toast.info(`"${trimmed}" is already assigned to the selected class(es).`);
      } else {
        toast.success(
          `Added "${trimmed}" to ${
            selectedClassTarget === "all" ? "all applicable classes" : selectedClassTarget
          }.`
        );
      }
      return next;
    });

    setCustomColorInput("");
  };

  const handleRemoveColor = (className: string, colorName: string) => {
    setClassColors((prev) => {
      const next = { ...prev };
      if (!next[className]) return prev;
      next[className] = next[className].filter(
        (c) => c.toLowerCase() !== colorName.toLowerCase()
      );
      if (next[className].length === 0) {
        delete next[className];
      }
      return next;
    });
  };

  const handleClearClassColors = (className: string) => {
    setClassColors((prev) => {
      const next = { ...prev };
      delete next[className];
      return next;
    });
  };

  const handleClearAllColors = () => {
    setClassColors({});
  };

  const handleSave = () => {
    if (!currentStyle) {
      toast.error("Please select a uniform style.");
      return;
    }

    startSaving(async () => {
      const res = await saveStyleColors({
        schoolId: selectedSchool.id,
        styleId: currentStyle.id,
        classColors,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Colors saved for ${currentStyle.style_name}.`);
        onSaved(currentStyle.id, res.colors);
        onClose();
      }
    });
  };

  const configuredClassCount = Object.keys(classColors).filter(
    (c) => applicableClasses.includes(c) && classColors[c]?.length > 0
  ).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-bold">
          <Palette className="h-5 w-5 text-evenvibe-primary" />
          <span>Class-Wise Uniform Color Configuration</span>
        </DialogTitle>
        <DialogDescription className="text-xs">
          School: <strong className="text-slate-800">{selectedSchool.name}</strong> · Configure allowed colors for each class.
        </DialogDescription>
      </DialogHeader>

      {styles.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs flex items-center gap-2 justify-center">
            <AlertCircle className="h-4 w-4 shrink-0 text-status-warning" />
            <span>No uniform designs exist for this school yet. Please create a Uniform Design first before configuring colors.</span>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {/* 1. Style Selection */}
          <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
            <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              1. Select Uniform Style <span className="text-status-error">*</span>
            </Label>
            <Select value={selectedStyleId} onValueChange={handleSelectStyle}>
              <SelectTrigger className="bg-white border-slate-300 text-xs font-medium">
                <SelectValue placeholder="Choose Uniform Style" />
              </SelectTrigger>
              <SelectContent>
                {styles.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.style_name} • {s.item_name} ({s.gender || "All"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {currentStyle && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">Applicable Classes:</span>
                {applicableClasses.length > 0 ? (
                  applicableClasses.map((cls) => (
                    <Badge
                      key={cls}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-white border-slate-200"
                    >
                      {cls}
                    </Badge>
                  ))
                ) : (
                  <span className="text-status-warning italic">No applicable classes assigned to this style</span>
                )}
              </div>
            )}
          </div>

          {currentStyle && applicableClasses.length > 0 && (
            <>
              {/* 2. Class Target & Color Adding */}
              <div className="space-y-3 p-3 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    2. Add Colors to Class
                  </Label>
                  <span className="text-[11px] text-slate-400">
                    Target: {selectedClassTarget === "all" ? "All Applicable Classes" : selectedClassTarget}
                  </span>
                </div>

                {/* Target Class Dropdown */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">Select Class</Label>
                  <Select value={selectedClassTarget} onValueChange={(val) => setSelectedClassTarget(val || "all")}>
                    <SelectTrigger className="bg-slate-50 text-xs h-8">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs font-semibold text-evenvibe-deep">
                        ★ All Applicable Classes ({applicableClasses.length})
                      </SelectItem>
                      {applicableClasses.map((cls) => (
                        <SelectItem key={cls} value={cls} className="text-xs">
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quick Add Suggested Colors */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Suggested Colors</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_COLOR_SUGGESTIONS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => handleAddColor(col)}
                        className="text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 font-medium transition-all shadow-2xs"
                      >
                        + {col}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Color Input */}
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[11px] text-slate-500">Custom Color Name</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Lavender, Olive Green, Rust..."
                      value={customColorInput}
                      onChange={(e) => setCustomColorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddColor(customColorInput);
                        }
                      }}
                      className="h-8 text-xs bg-slate-50"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddColor(customColorInput)}
                      className="h-8 px-3 bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs font-semibold shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* 3. Review & Manage Configured Colors per Class */}
              <div className="space-y-2 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      3. Configured Colors by Class
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      {configuredClassCount} of {applicableClasses.length} applicable class(es) have colors configured.
                    </p>
                  </div>
                  {configuredClassCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAllColors}
                      className="h-6 text-[11px] text-status-error hover:text-red-700 hover:bg-red-50 px-2"
                    >
                      Clear All
                    </Button>
                  )}
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {applicableClasses.map((cls) => {
                    const colors = classColors[cls] || [];
                    const hasColors = colors.length > 0;

                    return (
                      <div
                        key={cls}
                        className={`p-2.5 rounded-md border transition-colors ${
                          hasColors
                            ? "bg-white border-slate-200 shadow-2xs"
                            : "bg-slate-100/60 border-dashed border-slate-200 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-bold text-slate-800">
                            {cls}
                          </span>
                          {hasColors && (
                            <button
                              type="button"
                              onClick={() => handleClearClassColors(cls)}
                              className="text-[10px] text-slate-400 hover:text-status-error flex items-center gap-0.5 transition-colors"
                              title={`Clear all colors for ${cls}`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Clear
                            </button>
                          )}
                        </div>

                        {hasColors ? (
                          <div className="flex flex-wrap gap-1.5">
                            {colors.map((col) => (
                              <span
                                key={col}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-evenvibe-light text-emerald-900 border border-emerald-200 shadow-2xs"
                              >
                                {col}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveColor(cls, col)}
                                  className="text-evenvibe-deep hover:text-status-error rounded-full p-0.5 transition-colors"
                                  title={`Remove ${col}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400">
                            Students in {cls} will not be asked for a color.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !currentStyle}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-semibold text-xs"
            >
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Save Colors
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  );
}

export function ColorManagementDialog({
  open,
  onOpenChange,
  selectedSchool,
  styles,
  initialStyleId,
  onSaved,
}: ColorManagementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        {open && (
          <ColorManagementModalBody
            key={`${initialStyleId || styles[0]?.id || "default"}`}
            selectedSchool={selectedSchool}
            styles={styles}
            initialStyleId={initialStyleId}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
