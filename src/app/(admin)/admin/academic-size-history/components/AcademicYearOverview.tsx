"use client";

import { formatAcademicYear } from "@/lib/constants/academicYear";
import { AcademicYearOverviewItem } from "../types";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AcademicYearOverviewProps {
  overview: AcademicYearOverviewItem[];
  selectedYear?: string | null;
  onSelectYear?: (year: string) => void;
}

export function AcademicYearOverview({
  overview,
  selectedYear,
  onSelectYear,
}: AcademicYearOverviewProps) {
  if (!overview || overview.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 tracking-wide uppercase">
        <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
        <span>Academic Years Overview</span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {overview.map((item) => {
          const isSelected = selectedYear === item.academic_year;

          return (
            <button
              key={item.academic_year}
              type="button"
              onClick={() => {
                if (onSelectYear) {
                  onSelectYear(isSelected ? "all" : item.academic_year);
                }
              }}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-all text-left shadow-2xs cursor-pointer shrink-0 select-none",
                isSelected
                  ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span className="font-semibold">
                {formatAcademicYear(item.academic_year)}
              </span>
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded font-medium",
                  isSelected
                    ? "bg-slate-800 text-slate-200"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {item.count.toLocaleString()} Records
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
