"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RotateCcw, Filter } from "lucide-react";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import { formatAcademicYear } from "@/lib/constants/academicYear";
import { HistoryFilters, SchoolOption, AcademicYearOverviewItem } from "../types";

interface HistoryFilterPanelProps {
  schools: SchoolOption[];
  yearOverview: AcademicYearOverviewItem[];
  initialFilters: HistoryFilters;
  onApplyFilters: (filters: HistoryFilters) => void;
  onResetFilters: () => void;
  isLoading?: boolean;
}

const SECTION_OPTIONS = ["A", "B", "C", "D", "E", "F"];

export function HistoryFilterPanel({
  schools,
  yearOverview,
  initialFilters,
  onApplyFilters,
  onResetFilters,
  isLoading,
}: HistoryFilterPanelProps) {
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);

  const availableYears = Array.from(
    new Set(yearOverview.map((y) => y.academic_year))
  );

  // Derive human-readable labels so raw IDs are never displayed to the user
  const selectedSchool = schools.find((s) => s.id === filters.school_id);
  const selectedSchoolLabel =
    filters.school_id === "all" || !filters.school_id
      ? "All Schools"
      : selectedSchool?.name || (schools.length > 0 ? "Unknown School" : "All Schools");

  const selectedYearLabel =
    filters.academic_year === "all" || !filters.academic_year
      ? "All Years"
      : formatAcademicYear(filters.academic_year);

  const selectedClassLabel =
    filters.class_name === "all" || !filters.class_name
      ? "All Classes"
      : filters.class_name;

  const selectedSectionLabel =
    filters.section === "all" || !filters.section
      ? "All Sections"
      : `Section ${filters.section}`;

  const selectedGenderLabel =
    filters.gender === "all" || !filters.gender
      ? "All Genders"
      : filters.gender;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyFilters({ ...filters, page: 1 });
  };

  const handleReset = () => {
    const emptyFilters: HistoryFilters = {
      school_id: "all",
      academic_year: "all",
      class_name: "all",
      section: "all",
      gender: "all",
      search: "",
      page: 1,
      pageSize: 20,
    };
    setFilters(emptyFilters);
    onResetFilters();
  };

  return (
    <form
      onSubmit={handleApply}
      className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 shadow-xs"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-semibold text-slate-800">
        <Filter className="h-4 w-4 text-evenvibe-primary" />
        <span>Filter Academic History</span>
      </div>

      {/* 12-Column Responsive Filter Grid */}
      <div className="grid grid-cols-12 gap-3 sm:gap-3.5">
        {/* 1. School (col-span-12 on mobile, col-span-6 on sm/md, col-span-4 on lg, col-span-3 on xl) */}
        <div className="space-y-1.5 min-w-0 col-span-12 sm:col-span-6 md:col-span-6 lg:col-span-4 xl:col-span-3">
          <Label className="text-xs font-medium text-slate-600">School</Label>
          <Select
            value={filters.school_id || "all"}
            onValueChange={(val) =>
              setFilters((prev) => ({ ...prev, school_id: val || "all" }))
            }
          >
            <SelectTrigger
              className="w-full min-w-0 h-9 text-xs bg-slate-50/70 border-slate-200 justify-between overflow-hidden"
              title={selectedSchoolLabel}
            >
              <SelectValue placeholder="All Schools">
                <span className="truncate block text-left">
                  {selectedSchoolLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Schools
              </SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Academic Year */}
        <div className="space-y-1.5 min-w-0 col-span-12 sm:col-span-6 md:col-span-6 lg:col-span-4 xl:col-span-2">
          <Label className="text-xs font-medium text-slate-600">Academic Year</Label>
          <Select
            value={filters.academic_year || "all"}
            onValueChange={(val) =>
              setFilters((prev) => ({ ...prev, academic_year: val || "all" }))
            }
          >
            <SelectTrigger
              className="w-full min-w-0 h-9 text-xs bg-slate-50/70 border-slate-200 justify-between overflow-hidden"
              title={selectedYearLabel}
            >
              <SelectValue placeholder="All Years">
                <span className="truncate block text-left">
                  {selectedYearLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Years
              </SelectItem>
              {availableYears.map((yr) => (
                <SelectItem key={yr} value={yr} className="text-xs">
                  {formatAcademicYear(yr)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Class */}
        <div className="space-y-1.5 min-w-0 col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-4 xl:col-span-2">
          <Label className="text-xs font-medium text-slate-600">Class</Label>
          <Select
            value={filters.class_name || "all"}
            onValueChange={(val) =>
              setFilters((prev) => ({ ...prev, class_name: val || "all" }))
            }
          >
            <SelectTrigger
              className="w-full min-w-0 h-9 text-xs bg-slate-50/70 border-slate-200 justify-between overflow-hidden"
              title={selectedClassLabel}
            >
              <SelectValue placeholder="All Classes">
                <span className="truncate block text-left">
                  {selectedClassLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Classes
              </SelectItem>
              {STANDARD_CLASSES.map((cls) => (
                <SelectItem key={cls} value={cls} className="text-xs">
                  {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 4. Section */}
        <div className="space-y-1.5 min-w-0 col-span-6 sm:col-span-3 md:col-span-4 lg:col-span-3 xl:col-span-1">
          <Label className="text-xs font-medium text-slate-600">Section</Label>
          <Select
            value={filters.section || "all"}
            onValueChange={(val) =>
              setFilters((prev) => ({ ...prev, section: val || "all" }))
            }
          >
            <SelectTrigger
              className="w-full min-w-0 h-9 text-xs bg-slate-50/70 border-slate-200 justify-between overflow-hidden"
              title={selectedSectionLabel}
            >
              <SelectValue placeholder="All Sections">
                <span className="truncate block text-left">
                  {selectedSectionLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Sections
              </SelectItem>
              {SECTION_OPTIONS.map((sec) => (
                <SelectItem key={sec} value={sec} className="text-xs">
                  Section {sec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 5. Gender */}
        <div className="space-y-1.5 min-w-0 col-span-6 sm:col-span-3 md:col-span-4 lg:col-span-3 xl:col-span-1">
          <Label className="text-xs font-medium text-slate-600">Gender</Label>
          <Select
            value={filters.gender || "all"}
            onValueChange={(val) =>
              setFilters((prev) => ({ ...prev, gender: val || "all" }))
            }
          >
            <SelectTrigger
              className="w-full min-w-0 h-9 text-xs bg-slate-50/70 border-slate-200 justify-between overflow-hidden"
              title={selectedGenderLabel}
            >
              <SelectValue placeholder="All Genders">
                <span className="truncate block text-left">
                  {selectedGenderLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Genders
              </SelectItem>
              <SelectItem value="Male" className="text-xs">
                Male
              </SelectItem>
              <SelectItem value="Female" className="text-xs">
                Female
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 6. Search */}
        <div className="space-y-1.5 min-w-0 col-span-12 sm:col-span-12 md:col-span-12 lg:col-span-6 xl:col-span-3">
          <Label className="text-xs font-medium text-slate-600">Search</Label>
          <div className="relative w-full min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search student or admission number..."
              value={filters.search || ""}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="w-full pl-8 pr-3 text-xs h-9 bg-slate-50/70 border-slate-200 min-w-0"
            />
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isLoading}
          className="w-full sm:w-auto text-xs h-8 px-3 text-slate-600 hover:text-slate-800 hover:bg-slate-50 border-slate-200"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full sm:w-auto bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs h-8 px-4 font-medium"
        >
          Apply Filters
        </Button>
      </div>
    </form>
  );
}
