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
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  FileCheck,
} from "lucide-react";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import {
  getTcStudentsSummary,
  getTcStudentsList,
  TcStudentsSummaryData,
} from "./actions";
import { TcStudentItem } from "./schema";
import { NewTcStudentDialog } from "./NewTcStudentDialog";
import { TcStudentDetailsDialog } from "./TcStudentDetailsDialog";
import { EditTcStudentDialog } from "./EditTcStudentDialog";
import { DeleteTcStudentDialog } from "./DeleteTcStudentDialog";

export default function TcStudentsPage() {
  // Summary
  const [summary, setSummary] = useState<TcStudentsSummaryData>({
    totalTcStudents: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // List & pagination
  const [tcStudents, setTcStudents] = useState<TcStudentItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Search & Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  // Dialog states
  const [selectedViewRecord, setSelectedViewRecord] = useState<TcStudentItem | null>(null);
  const [selectedEditRecord, setSelectedEditRecord] = useState<TcStudentItem | null>(null);
  const [selectedDeleteRecord, setSelectedDeleteRecord] = useState<TcStudentItem | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch summary count
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    const res = await getTcStudentsSummary();
    if (res.success) {
      setSummary(res.summary);
    }
    setLoadingSummary(false);
  }, []);

  // Fetch paginated list
  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const res = await getTcStudentsList({
      search: debouncedSearch,
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
  }, [debouncedSearch, classFilter, page]);

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(async () => {
      if (!ignore) {
        await fetchSummary();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchSummary]);

  useRealtimeSubscription({
    table: "tc_students",
    onEvent: () => {
      fetchSummary();
      fetchList();
    },
  });

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

  const handleRefresh = () => {
    fetchSummary();
    fetchList();
  };

  const handleClassChange = (val: string | null) => {
    setClassFilter(val || "all");
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            TC Students
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage students who have been issued a Transfer Certificate.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <NewTcStudentDialog onSuccess={handleRefresh} />
        </div>
      </div>

      {/* Summary KPI Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
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
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search by student name, admission #, or TC #..."
              className="pl-9 bg-slate-50/70 border-slate-200 focus:bg-white text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-48">
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
            {summary.totalTcStudents === 0 ? (
              <>
                <h3 className="text-base font-semibold text-slate-900">
                  No TC students yet
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mt-1 mb-5">
                  Students with Transfer Certificate records will appear here.
                </p>
                <NewTcStudentDialog onSuccess={handleRefresh} />
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-slate-900">
                  No matching TC records found
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mt-1 mb-4">
                  Try adjusting your search query or class filter.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    setClassFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider py-3.5">
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
                    TC Number
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-xs uppercase tracking-wider text-right pr-6">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {tcStudents.map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50/70">
                    <TableCell className="font-medium text-slate-900 py-3.5">
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
                    <TableCell className="text-slate-900 font-bold text-sm">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200">
                        {item.tc_number}
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1">
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEditRecord(item)}
                          className="h-8 w-8 p-0 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                          title="Edit TC Number"
                        >
                          <Edit2 className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedDeleteRecord(item)}
                          className="h-8 w-8 p-0 text-slate-600 hover:text-red-600 hover:bg-red-50"
                          title="Remove TC Record"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
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

      {/* View Modal */}
      <TcStudentDetailsDialog
        tcStudent={selectedViewRecord}
        open={!!selectedViewRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedViewRecord(null);
        }}
      />

      {/* Edit Modal */}
      <EditTcStudentDialog
        tcStudent={selectedEditRecord}
        open={!!selectedEditRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedEditRecord(null);
        }}
        onSuccess={handleRefresh}
      />

      {/* Delete Modal */}
      <DeleteTcStudentDialog
        tcStudent={selectedDeleteRecord}
        open={!!selectedDeleteRecord}
        onOpenChange={(open) => {
          if (!open) setSelectedDeleteRecord(null);
        }}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
