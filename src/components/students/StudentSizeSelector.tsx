"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  DEFAULT_STUDENT_SIZES,
  isPositiveWholeNumber,
  sortSizes,
} from "@/lib/constants/studentSizes";

interface StudentSizeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  itemName?: string;
  isRequired?: boolean;
  disabled?: boolean;
  configuredSizes?: string[];
  className?: string;
}

export function StudentSizeSelector({
  value,
  onChange,
  itemName = "item",
  isRequired = false,
  disabled = false,
  configuredSizes = [],
  className = "",
}: StudentSizeSelectorProps) {
  const [customSizes, setCustomSizes] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Combined and numerically sorted size options
  const allSizes = useMemo(() => {
    const set = new Set<string>(DEFAULT_STUDENT_SIZES);

    // Add configured positive whole numbers if any
    (configuredSizes || []).forEach((sz) => {
      const trimmed = sz.trim();
      if (isPositiveWholeNumber(trimmed)) {
        set.add(trimmed);
      }
    });

    // Add user-added custom sizes
    customSizes.forEach((sz) => set.add(sz));

    // Include current value if it's a positive number (e.g. from existing student record)
    if (value && isPositiveWholeNumber(value)) {
      set.add(value.trim());
    }

    return sortSizes(Array.from(set));
  }, [configuredSizes, customSizes, value]);

  const handleAddCustomSize = () => {
    const trimmed = customInputValue.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a size number.");
      return;
    }

    if (!isPositiveWholeNumber(trimmed)) {
      setErrorMessage("Only positive whole numbers allowed (e.g. 48, 50).");
      return;
    }

    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num <= 0) {
      setErrorMessage("Invalid size number.");
      return;
    }

    const formatted = num.toString();

    // Prevent duplicate size
    if (allSizes.some((s) => s.trim() === formatted)) {
      setErrorMessage(`Size ${formatted} already exists.`);
      return;
    }

    // Add custom size, sort, and select it
    setCustomSizes((prev) => [...prev, formatted]);
    onChange(formatted);
    setCustomInputValue("");
    setErrorMessage("");
    setShowCustomInput(false);
  };

  const handleRemoveCustomSize = (sizeToRemove: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCustomSizes((prev) => prev.filter((s) => s !== sizeToRemove));
    if (value === sizeToRemove) {
      onChange("");
    }
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* 1. Dropdown Selector */}
      <Select
        value={value || "__none__"}
        onValueChange={(val) => {
          if (!val || val === "__none__") {
            onChange("");
          } else if (val === "__custom__") {
            setShowCustomInput(true);
            setErrorMessage("");
          } else {
            onChange(val);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="bg-white text-xs h-9 w-full border-slate-200">
          <SelectValue
            placeholder={
              isRequired
                ? `Select ${itemName} size *`
                : `Select ${itemName} size (Optional)`
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {!isRequired && (
            <SelectItem value="__none__" className="text-xs text-slate-500 italic">
              -- None / Opt Out (Optional) --
            </SelectItem>
          )}
          {allSizes.map((sz) => (
            <SelectItem key={sz} value={sz} className="text-xs font-medium">
              Size {sz}
            </SelectItem>
          ))}
          <SelectItem
            value="__custom__"
            className="text-xs font-semibold text-evenvibe-deep focus:text-emerald-800 focus:bg-emerald-50 cursor-pointer border-t border-slate-100 mt-1"
          >
            + Custom Size
          </SelectItem>
        </SelectContent>
      </Select>

      {/* 2. Visual Size Chips & + Custom Size button */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {allSizes.map((sz) => {
          const isSelected = value === sz;
          const isCustom = !(DEFAULT_STUDENT_SIZES as readonly string[]).includes(sz);

          return (
            <button
              key={sz}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (isSelected) {
                  if (!isRequired) onChange("");
                } else {
                  onChange(sz);
                }
              }}
              className={`text-xs px-2.5 py-1 rounded border font-medium transition-colors inline-flex items-center gap-1 ${
                isSelected
                  ? "bg-evenvibe-primary text-white border-evenvibe-primary shadow-xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
              }`}
            >
              <span>{sz}</span>
              {isCustom && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleRemoveCustomSize(sz, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      handleRemoveCustomSize(sz);
                    }
                  }}
                  className={`rounded-full p-0.5 ml-0.5 focus:outline-none transition-colors ${
                    isSelected
                      ? "hover:text-red-200 text-white/80"
                      : "hover:text-status-error text-slate-400"
                  }`}
                  title={`Remove custom size ${sz}`}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}

        {/* + Custom Size button right after 46 (and custom sizes) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setShowCustomInput((prev) => !prev);
            setErrorMessage("");
          }}
          className="h-7 text-xs border-dashed border-slate-300 text-evenvibe-deep hover:text-emerald-800 hover:bg-emerald-50 px-2.5"
        >
          <Plus className="h-3 w-3 mr-1" /> Custom Size
        </Button>
      </div>

      {/* 3. Inline Custom Size Input Box */}
      {showCustomInput && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Custom Size</span>
            <span className="text-[11px] text-slate-400">Numbers only (e.g. 48, 50)</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter size..."
              value={customInputValue}
              autoFocus
              onChange={(e) => {
                // Strict numeric-only: strip any non-digit characters immediately
                const cleaned = e.target.value.replace(/\D/g, "");
                setCustomInputValue(cleaned);
                if (errorMessage) setErrorMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomSize();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setShowCustomInput(false);
                  setCustomInputValue("");
                  setErrorMessage("");
                }
              }}
              className="h-8 text-xs bg-white w-36"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddCustomSize}
              className="h-8 text-xs bg-evenvibe-primary hover:bg-evenvibe-deep text-white px-3 font-medium"
            >
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCustomInput(false);
                setCustomInputValue("");
                setErrorMessage("");
              }}
              className="h-8 text-xs px-2.5 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </Button>
          </div>
          {errorMessage && (
            <p className="text-[11px] font-medium text-status-error">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
