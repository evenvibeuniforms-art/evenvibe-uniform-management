"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  UserMinus,
  School as SchoolIcon,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  FileCheck,
  Download,
} from "lucide-react";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import {
  getAdminTcStudentsSummary,
  getAdminSchoolsForTcFilter,
  getAdminTcStudentsList,
  AdminTcStudentItem,
  AdminTcStudentsSummary,
} from "./actions";
import { AdminTcStudentDetailsDialog } from "./AdminTcStudentDetailsDialog";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";
import { toast } from "sonner";

export default function AdminTcStudentsPage() {
  // Summary
  const [summary, setSummary] = useState<AdminTcStudentsSummary>({
    totalTcStudents: 0,
    totalSchoolsWithTc: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Schools for filter
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);

  // List & pagination
  const [tcStudents, setTcStudents] = useState<AdminTcStudentItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Search & Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Dialog state
  const [selectedViewRecord, setSelectedViewRecord] = useState<AdminTcStudentItem | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const formatDateDisplay = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const parts = dateStr.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    const res = await getAdminTcStudentsSummary();
    if (res.success) {
      setSummary(res.summary);
    }
    setLoadingSummary(false);
  }, []);

  const fetchSchools = useCallback(async () => {
    const data = await getAdminSchoolsForTcFilter();
    setSchools(data);
  }, []);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const res = await getAdminTcStudentsList({
      search: debouncedSearch,
      schoolId: schoolFilter,
      className: classFilter,
      page,
      pageSize: 15,
    });

    if (res.success) {
      setTcStudents(res.tcStudents);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages || 1);
    }
    setLoadingList(false);
  }, [debouncedSearch, schoolFilter, classFilter, page]);

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(async () => {
      if (!ignore) {
        await Promise.all([fetchSummary(), fetchSchools()]);
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchSummary, fetchSchools]);

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(async () => {
      if (!ignore) {
        await fetchList();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchList]);

  // Realtime subscription
  useRealtimeSubscription({
    table: "tc_students",
    onEvent: () => {
      fetchSummary();
      fetchList();
    },
  });

  const handleRefresh = () => {
    fetchSummary();
    fetchList();
  };

  const handleSchoolChange = (val: string | null) => {
    setSchoolFilter(val || "all");
    setPage(1);
  };

  const handleClassChange = (val: string | null) => {
    setClassFilter(val || "all");
    setPage(1);
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const res = await getAdminTcStudentsList({
        search: debouncedSearch,
        schoolId: schoolFilter,
        className: classFilter,
        page: 1,
        pageSize: 10000,
      });

      if (!res.success || !res.tcStudents || res.tcStudents.length === 0) {
        toast.error("No TC student records found to export.");
        return;
      }

      const exportData = res.tcStudents.map((item) => ({
        School: item.school.name,
        "Student Name": item.student.student_name,
        "Admission Number": item.student.admission_number,
        Class: item.student.class_name,
        Section: item.student.section,
        Gender: item.student.gender,
        "TC Date": item.tc_date ? formatDateDisplay(item.tc_date) : "Not Recorded",
      }));

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "TC Students");

      const fileName = `admin_tc_students_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success(`Exported ${res.tcStudents.length} TC student records.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            TC Students
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Global monitoring of Transfer Certificate records across schools.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isExporting || totalCount === 0}
            className="h-9 text-slate-600 hover:text-slate-900"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            Export Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loadingList || loadingSummary}
            className="h-9 text-slate-600 hover:text-slate-900"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${
                loadingList || loadingSummary ? "animate-spin" : ""
              }`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-red-50 text-status-error rounded-xl">
              <UserMinus className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total TC Students
              </p>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {loadingSummary ? (
                  <span className="text-slate-300">...</span>
                ) : (
                  summary.totalTcStudents
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <SchoolIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Schools with TC Records
              </p>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {loadingSummary ? (
                  <span className="text-slate-300">...</span>
                ) : (
                  summary.totalSchoolsWithTc
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search by student name or admission #..."
              className="pl-9 bg-slate-50/70 border-slate-200 focus:bg-white text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* School filter */}
          <div className="w-full sm:w-[220px] min-w-0">
            <Select value={schoolFilter} onValueChange={handleSchoolChange}>
              <SelectTrigger className="w-full min-w-0 h-9 bg-slate-50/70 border-slate-200 text-sm justify-between">
                <SelectValue placeholder="All Schools" className="min-w-0 truncate text-left">
                  {(val: unknown) => {
                    const activeId = typeof val === "string" && val.length > 0 ? val : schoolFilter;
                    if (!activeId || activeId === "all") return "All Schools";
                    const found = schools.find((sch) => sch.id === activeId);
                    const label = found ? found.name : (schools.length > 0 ? "Unknown School" : "All Schools");
                    return (
                      <span className="truncate block" title={label}>
                        {label}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 min-w-48">
                <SelectItem value="all">All Schools</SelectItem>
                {schools.map((sch) => (
                  <SelectItem key={sch.id} value={sch.id}>
                    {sch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class filter */}
          <div>
            <Select value={classFilter} onValueChange={handleClassChange}>
              <SelectTrigger className="bg-slate-50/70 border-slate-200 text-sm">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {STANDARD_CLASSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="text-xs text-slate-500 font-medium whitespace-nowrap pl-2">
            Showing {(page - 1) * 15 + 1}–
            {Math.min(page * 15, totalCount)} of {totalCount}
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 text-sm">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            Loading TC students...
          </div>
        ) : tcStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full mb-3.5">
              <FileCheck className="h-8 w-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              No matching TC records found
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1 mb-4">
              Try adjusting your search query, school filter, or class filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setSchoolFilter("all");
                setClassFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider py-3.5">
                      School
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      Student Name
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      Admission Number
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      Class
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      Section
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      Gender
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider">
                      TC Date
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider text-right pr-6">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {tcStudents.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/70">
                      <TableCell className="font-semibold text-slate-900 py-3.5">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-xs">
                          {item.school.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {item.student.student_name}
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {item.student.admission_number}
                      </TableCell>
                      <TableCell className="text-slate-700 text-sm">
                        {item.student.class_name}
                      </TableCell>
                      <TableCell className="text-slate-700 text-sm">
                        {item.student.section}
                      </TableCell>
                      <TableCell className="text-slate-700 text-sm">
                        {item.student.gender}
                      </TableCell>
                      <TableCell className="text-slate-900 font-semibold text-sm">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">
                          {formatDateDisplay(item.tc_date)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedViewRecord(item)}
                          className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 p-3">
              {tcStudents.map((item) => (
                <MobileCard key={item.id}>
                  <MobileCardField label="School" value={item.school.name} />
                  <MobileCardField label="Student Name" value={item.student.student_name} />
                  <MobileCardField label="Admission Number" value={item.student.admission_number || "-"} />
                  <MobileCardField label="Class" value={item.student.class_name || "-"} />
                  <MobileCardField label="Section" value={item.student.section || "-"} />
                  <MobileCardField label="Gender" value={item.student.gender || "-"} />
                  <MobileCardField label="TC Date">
                    <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200 font-bold text-slate-900 text-xs">
                      {formatDateDisplay(item.tc_date)}
                    </span>
                  </MobileCardField>
                  <MobileCardActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedViewRecord(item)}
                      className="h-8 px-2.5 text-xs text-slate-600 hover:text-blue-600"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                    </Button>
                  </MobileCardActions>
                </MobileCard>
              ))}
            </div>
          </>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="text-xs text-slate-500 font-medium">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loadingList}
                className="h-8 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loadingList}
                className="h-8 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Details Dialog */}
      <AdminTcStudentDetailsDialog
        tcStudent={selectedViewRecord}
        open={Boolean(selectedViewRecord)}
        onOpenChange={(open) => !open && setSelectedViewRecord(null)}
      />
    </div>
  );
}
