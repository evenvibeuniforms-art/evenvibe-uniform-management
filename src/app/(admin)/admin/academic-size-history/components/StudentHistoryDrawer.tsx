"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAcademicYear, compareAcademicYears } from "@/lib/constants/academicYear";
import {
  DetailedHistoryRecord,
  StudentHistorySummaryRow,
} from "../types";
import {
  History,
  Calendar,
  Layers,
  ArrowDown,
  Info,
  User,
  GraduationCap,
} from "lucide-react";

interface StudentHistoryDrawerProps {
  student: StudentHistorySummaryRow | null;
  records: DetailedHistoryRecord[];
  isLoading: boolean;
  error?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentHistoryDrawer({
  student,
  records,
  isLoading,
  error,
  open,
  onOpenChange,
}: StudentHistoryDrawerProps) {
  if (!student) return null;

  // 1. Dynamic academic years present for this student
  const studentYears = Array.from(
    new Set(records.map((r) => r.academic_year))
  ).sort(compareAcademicYears);

  // 2. Distinct uniform items present for this student
  const studentItems = Array.from(
    new Set(records.map((r) => r.item_name.trim()))
  ).sort();

  // 3. Matrix lookup: item -> academic_year -> size
  const comparisonMatrix = new Map<string, Map<string, string>>();
  studentItems.forEach((item) => {
    const yearMap = new Map<string, string>();
    records
      .filter((r) => r.item_name.trim().toLowerCase() === item.toLowerCase())
      .forEach((r) => {
        yearMap.set(r.academic_year, r.size);
      });
    comparisonMatrix.set(item, yearMap);
  });

  // 4. Grouped records by academic year for timeline
  const timelineByYear = new Map<string, DetailedHistoryRecord[]>();
  studentYears.forEach((year) => {
    const yearRecords = records.filter((r) => r.academic_year === year);
    timelineByYear.set(year, yearRecords);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col gap-0 bg-slate-50/50"
      >
        {/* Header */}
        <SheetHeader className="p-5 border-b border-slate-200 bg-white sticky top-0 z-10 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-bold text-slate-900 tracking-tight uppercase">
                  {student.student_name}
                </SheetTitle>
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200">
                  {student.admission_number}
                </Badge>
              </div>
              <SheetDescription className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-500" />
                  {student.school_name}
                </span>
                <span>•</span>
                <span>
                  {student.class_name}
                  {student.section ? ` • Sec ${student.section}` : ""}
                </span>
                {student.gender && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <User className="h-3 w-3 text-slate-400" />
                      {student.gender}
                    </span>
                  </>
                )}
              </SheetDescription>
            </div>

            <Badge
              variant="secondary"
              className="bg-evenvibe-light text-evenvibe-deep border border-emerald-200 shrink-0 font-semibold text-xs"
            >
              {student.years_count} Academic Year{student.years_count > 1 ? "s" : ""}
            </Badge>
          </div>
        </SheetHeader>

        {/* Content Body */}
        <div className="p-5 space-y-6 flex-1">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-status-error" />
              <span>{error}</span>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-lg text-slate-500 text-xs">
              No historical size records found for this student.
            </div>
          ) : (
            <>
              {/* Section 1: Year-Wise Size Comparison */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-evenvibe-primary" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Year-Wise Size Comparison
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400">Actual Sizes</span>
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/70">
                      <TableRow className="border-b border-slate-200">
                        <TableHead className="text-xs font-semibold text-slate-700 w-36">
                          Item
                        </TableHead>
                        {studentYears.map((year) => (
                          <TableHead
                            key={year}
                            className="text-xs font-semibold text-slate-700 text-center"
                          >
                            {formatAcademicYear(year)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentItems.map((item) => {
                        const yearMap = comparisonMatrix.get(item);
                        return (
                          <TableRow key={item} className="hover:bg-slate-50/50">
                            <TableCell className="font-semibold text-xs text-slate-800">
                              {item}
                            </TableCell>
                            {studentYears.map((year) => {
                              const sizeVal = yearMap?.get(year);
                              return (
                                <TableCell
                                  key={year}
                                  className="text-center text-xs"
                                >
                                  {sizeVal ? (
                                    <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                                      {sizeVal}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic text-[11px]">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden p-3 space-y-2">
                  {studentItems.map((item) => {
                    const yearMap = comparisonMatrix.get(item);
                    return (
                      <div key={item} className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2">
                        <div className="font-bold text-xs text-slate-800">{item}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {studentYears.map((year) => {
                            const sizeVal = yearMap?.get(year);
                            return (
                              <div key={year} className="flex flex-col bg-white border border-slate-200/80 rounded p-2">
                                <span className="text-[10px] text-slate-500 font-medium">AY {formatAcademicYear(year)}</span>
                                <span className="font-mono font-bold text-xs text-slate-900 mt-0.5">
                                  {sizeVal ? `Size ${sizeVal}` : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Style + Color Details */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Style & Color Details
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {records.length} records
                  </span>
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/70">
                      <TableRow className="border-b border-slate-200">
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Year
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Item
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Style
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Color
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-center">
                          Size
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-center">
                          Source
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Recorded Date
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((rec) => (
                        <TableRow key={rec.id} className="hover:bg-slate-50/50">
                          <TableCell className="text-xs font-medium text-slate-700">
                            {formatAcademicYear(rec.academic_year)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-900">
                            {rec.item_name}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {rec.style_name || (
                              <span className="text-slate-400 italic text-[11px]">
                                Style not available
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {rec.color ? (
                              <span className="font-medium text-blue-700">
                                {rec.color}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                Not specified
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center font-bold text-slate-900 font-mono">
                            {rec.size}
                          </TableCell>
                          <TableCell className="text-center">
                            {rec.source_type === "manual_baseline" ? (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold"
                              >
                                Baseline
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-semibold"
                              >
                                Historical
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-500 whitespace-nowrap">
                            {rec.created_at
                              ? new Date(rec.created_at).toLocaleDateString("en-IN", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden p-3 space-y-2.5">
                  {records.map((rec) => (
                    <div key={rec.id} className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{rec.item_name}</span>
                        <span className="font-mono font-bold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-900">
                          Size {rec.size}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>AY {formatAcademicYear(rec.academic_year)}</span>
                        {rec.source_type === "manual_baseline" ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold">
                            Baseline
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-semibold">
                            Historical
                          </Badge>
                        )}
                      </div>
                      {(rec.style_name || rec.color) && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                          {rec.style_name && <span>Style: {rec.style_name}</span>}
                          {rec.style_name && rec.color && <span>•</span>}
                          {rec.color && <span className="text-blue-600 font-medium">{rec.color}</span>}
                        </div>
                      )}
                      {rec.created_at && (
                        <div className="text-[10px] text-slate-400 pt-0.5">
                          Date: {new Date(rec.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Visual Academic Timeline */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Calendar className="h-4 w-4 text-evenvibe-primary" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Actual Size Progression Timeline
                  </h3>
                </div>

                <div className="space-y-3 pt-2">
                  {studentYears.map((year, idx) => {
                    const yearRecords = timelineByYear.get(year) || [];
                    const isLast = idx === studentYears.length - 1;

                    return (
                      <div key={year} className="relative pl-6 pb-2">
                        {/* Vertical line connecting nodes */}
                        {!isLast && (
                          <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200" />
                        )}

                        {/* Bullet / Node */}
                        <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-evenvibe-light border-2 border-evenvibe-primary flex items-center justify-center shadow-2xs">
                          <span className="text-[10px] font-bold text-evenvibe-deep">
                            {idx + 1}
                          </span>
                        </div>

                        {/* Content Card */}
                        <div className="bg-slate-50/80 border border-slate-200 rounded-md p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-800">
                              Academic Year {formatAcademicYear(year)}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {yearRecords.length} item{yearRecords.length > 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {yearRecords.map((r) => (
                              <div
                                key={r.id}
                                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2.5 py-1 text-xs shadow-2xs"
                              >
                                <span className="font-semibold text-slate-700">
                                  {r.item_name}:
                                </span>
                                <span className="font-mono font-bold text-slate-900">
                                  Size {r.size}
                                </span>
                                {r.color && (
                                  <span className="text-[10px] text-blue-600 font-medium">
                                    • {r.color}
                                  </span>
                                )}
                                {r.source_type === "manual_baseline" && (
                                  <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-semibold">
                                    Baseline
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {!isLast && (
                          <div className="flex justify-center my-1">
                            <ArrowDown className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
