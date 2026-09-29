"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, ChevronLeft, ChevronRight, AlertCircle, History } from "lucide-react";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";
import {
  AcademicSizeHistoryResponse,
  HistoryFilters,
  StudentHistorySummaryRow,
  DetailedHistoryRecord,
} from "../types";
import { getAcademicSizeHistoryData, getStudentDetailedHistory } from "../actions";
import { HistorySummaryCards } from "../components/HistorySummaryCards";
import { AcademicYearOverview } from "../components/AcademicYearOverview";
import { HistoryFilterPanel } from "../components/HistoryFilterPanel";
import { ExportHistoryButton } from "../components/ExportHistoryButton";
import { StudentHistoryDrawer } from "../components/StudentHistoryDrawer";

interface AcademicSizeHistoryViewProps {
  initialData: AcademicSizeHistoryResponse;
  initialFilters: HistoryFilters;
}

export function AcademicSizeHistoryView({
  initialData,
  initialFilters,
}: AcademicSizeHistoryViewProps) {
  const [data, setData] = useState<AcademicSizeHistoryResponse>(initialData);
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [selectedStudent, setSelectedStudent] = useState<StudentHistorySummaryRow | null>(null);
  const [studentDetails, setStudentDetails] = useState<DetailedHistoryRecord[]>([]);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentPage = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const totalStudents = data.totalStudentsCount;
  const totalPages = Math.max(1, Math.ceil(totalStudents / pageSize));

  const loadData = (newFilters: HistoryFilters) => {
    setFilters(newFilters);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const response = await getAcademicSizeHistoryData(newFilters);
        setData(response);
      } catch (err: unknown) {
        console.error("Error loading size history data:", err);
        setErrorMessage("Unable to load academic size history. Please try again.");
      }
    });
  };

  const handleApplyFilters = (newFilters: HistoryFilters) => {
    loadData({ ...filters, ...newFilters, page: 1 });
  };

  const handleResetFilters = () => {
    const resetFilters: HistoryFilters = {
      school_id: "all",
      academic_year: "all",
      class_name: "all",
      section: "all",
      gender: "all",
      search: "",
      page: 1,
      pageSize: 20,
    };
    loadData(resetFilters);
  };

  const handleSelectYearFromOverview = (year: string) => {
    loadData({ ...filters, academic_year: year, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadData({ ...filters, page: newPage });
  };

  const handleViewStudent = async (student: StudentHistorySummaryRow) => {
    setSelectedStudent(student);
    setIsDrawerOpen(true);
    setIsDetailsLoading(true);
    setStudentDetails([]);

    try {
      const details = await getStudentDetailedHistory(student.student_id);
      setStudentDetails(details);
    } catch (err) {
      console.error("Error loading student detailed history:", err);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-evenvibe-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Academic Size History
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            View and compare actual student uniform sizes across academic years.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ExportHistoryButton filters={filters} />
        </div>
      </div>

      {/* 2. Summary Cards */}
      <HistorySummaryCards stats={data.stats} isLoading={isPending} />

      {/* 3. Filter Section */}
      <HistoryFilterPanel
        key={`${filters.school_id}-${filters.academic_year}-${filters.class_name}-${filters.section}-${filters.gender}-${filters.search}`}
        schools={data.schools}
        yearOverview={data.yearOverview}
        initialFilters={filters}
        onApplyFilters={handleApplyFilters}
        onResetFilters={handleResetFilters}
        isLoading={isPending}
      />

      {/* 4. Academic Year Overview */}
      <AcademicYearOverview
        overview={data.yearOverview}
        selectedYear={filters.academic_year}
        onSelectYear={handleSelectYearFromOverview}
      />

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-status-error shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 5. Main Student History Table */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto w-full">
          <Table className="min-w-[760px]">
            <TableHeader className="bg-slate-50">
              <TableRow className="border-b border-slate-200">
                <TableHead className="text-xs font-semibold text-slate-700">Student Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Admission Number</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Class</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Section</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Gender</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Years</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-slate-100">
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell className="text-right pr-6"><Skeleton className="h-8 w-14 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 text-slate-500">
                      <History className="h-8 w-8 text-slate-300" />
                      <p className="font-semibold text-slate-700 text-sm">
                        No academic size history found.
                      </p>
                      <p className="text-xs text-slate-400">
                        Try changing the selected filters or academic year.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.students.map((student) => (
                  <TableRow key={student.student_id} className="hover:bg-slate-50/60 border-b border-slate-100">
                    <TableCell className="font-semibold text-xs text-slate-900">
                      {student.student_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-mono">
                      {student.admission_number}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {student.school_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {student.class_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {student.section ? `Section ${student.section}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {student.gender || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2 py-0.5"
                      >
                        {student.years_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewStudent(student)}
                        className="h-8 px-3 text-xs bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-2xs font-semibold"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 text-evenvibe-primary" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden p-3 space-y-3">
          {isPending ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-3 border border-slate-200 rounded-lg space-y-2 bg-white">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          ) : data.students.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No academic size history found.</p>
              <p className="text-xs text-slate-400">Try changing the selected filters or academic year.</p>
            </div>
          ) : (
            data.students.map((student) => (
              <MobileCard key={student.student_id}>
                <MobileCardField label="Student Name">
                  <span className="font-semibold text-xs text-slate-900">{student.student_name}</span>
                </MobileCardField>
                <MobileCardField label="Admission Number">
                  <span className="text-xs text-slate-600 font-mono">{student.admission_number}</span>
                </MobileCardField>
                <MobileCardField label="School">
                  <span className="text-xs text-slate-700">{student.school_name}</span>
                </MobileCardField>
                <MobileCardField label="Class">
                  <span className="text-xs text-slate-700">{student.class_name}</span>
                </MobileCardField>
                <MobileCardField label="Section">
                  <span className="text-xs text-slate-600">{student.section ? `Section ${student.section}` : "—"}</span>
                </MobileCardField>
                <MobileCardField label="Gender">
                  <span className="text-xs text-slate-600">{student.gender || "—"}</span>
                </MobileCardField>
                <MobileCardField label="Years Count">
                  <Badge
                    variant="secondary"
                    className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2 py-0.5"
                  >
                    {student.years_count} Academic Year{student.years_count > 1 ? "s" : ""}
                  </Badge>
                </MobileCardField>
                <MobileCardActions>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewStudent(student)}
                    className="w-full h-8 px-3 text-xs bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-2xs font-semibold"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1 text-evenvibe-primary" />
                    View History
                  </Button>
                </MobileCardActions>
              </MobileCard>
            ))
          )}
        </div>

        {/* Pagination Footer */}
        {totalStudents > 0 && (
          <div className="p-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              Showing{" "}
              <strong className="text-slate-800">
                {Math.min((currentPage - 1) * pageSize + 1, totalStudents)}
              </strong>{" "}
              to{" "}
              <strong className="text-slate-800">
                {Math.min(currentPage * pageSize, totalStudents)}
              </strong>{" "}
              of <strong className="text-slate-800">{totalStudents.toLocaleString()}</strong> students
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="h-8 px-2 text-xs"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-xs font-medium text-slate-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="h-8 px-2 text-xs"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 6. Student History Details Drawer */}
      <StudentHistoryDrawer
        student={selectedStudent}
        records={studentDetails}
        isLoading={isDetailsLoading}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div>
  );
}
