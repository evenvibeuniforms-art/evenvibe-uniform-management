"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ClipboardCheck, ChevronLeft, ChevronRight, Eye, Play } from "lucide-react";
import Link from "next/link";

const formatDate = (dateString: string, includeTime = false) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const QC_STATUS_LABELS: Record<string, string> = {
  ready_for_qc: "Ready for QC",
  pending: "Pending",
  in_progress: "In Progress",
  passed: "Passed",
  failed: "Failed",
};

const getQCBadgeColor = (status: string) => {
  switch (status) {
    case "ready_for_qc":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "pending":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "passed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export interface QualityCheckRow {
  id: string;
  orderNumber: string;
  schoolName: string;
  orderStatus: string;
  qcStatus: string; // 'ready_for_qc' | 'in_progress' | 'passed' | 'failed'
  createdAt: string;
  updatedAt: string;
  totalStudents: number;
  totalItems: number;
  checkedQuantity: number;
  passedQuantity: number;
  defectiveQuantity: number;
  hasQcRecord: boolean;
}

export default function AdminQualityCheckListView({
  orders: initialOrders,
  totalCount,
  currentPage,
  pageSize,
  statusCounts,
  search: initialSearch,
  status: initialStatus,
  date: initialDate,
  sort: initialSort,
  order: initialOrder,
}: {
  orders: QualityCheckRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  statusCounts: {
    all: number;
    ready_for_qc: number;
    in_progress: number;
    passed: number;
    failed: number;
  };
  search?: string;
  status?: string;
  date?: string;
  sort?: string;
  order?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<QualityCheckRow[]>(initialOrders);

  useRealtimeSubscription({
    table: "quality_check_records",
    onEvent: (payload) => {
      if (payload.new) {
        const rec = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === rec.order_id) {
              return {
                ...o,
                qcStatus: (rec.status as string) || o.qcStatus,
                checkedQuantity: Number(rec.checked_quantity) || 0,
                passedQuantity: Number(rec.passed_quantity) || 0,
                defectiveQuantity: Number(rec.defective_quantity) || 0,
                hasQcRecord: true,
                updatedAt: (rec.updated_at as string) || o.updatedAt,
              };
            }
            return o;
          })
        );
      }
    },
  });

  useRealtimeSubscription({
    table: "orders",
    onEvent: (payload) => {
      if (payload.new) {
        const ord = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === ord.id) {
              return {
                ...o,
                orderStatus: (ord.status as string) || o.orderStatus,
                updatedAt: (ord.updated_at as string) || o.updatedAt,
              };
            }
            return o;
          })
        );
      }
    },
  });

  const [search, setSearch] = useState(initialSearch || "");
  const [status, setStatus] = useState(initialStatus || "all");
  const [date, setDate] = useState(initialDate || "all");
  const [sort, setSort] = useState(initialSort || "updated_at");
  const [sortOrder, setSortOrder] = useState(initialOrder || "desc");

  const totalPages = Math.ceil(totalCount / pageSize);

  const applyFilters = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams.toString());

    const activeSearch = overrides.search !== undefined ? overrides.search : search;
    const activeStatus = overrides.status !== undefined ? overrides.status : status;
    const activeDate = overrides.date !== undefined ? overrides.date : date;
    const activeSort = overrides.sort !== undefined ? overrides.sort : sort;
    const activeOrder = overrides.order !== undefined ? overrides.order : sortOrder;

    if (activeSearch) params.set("search", activeSearch);
    else params.delete("search");

    if (activeStatus && activeStatus !== "all") params.set("status", activeStatus);
    else params.delete("status");

    if (activeDate && activeDate !== "all") params.set("date", activeDate);
    else params.delete("date");

    if (activeSort) params.set("sort", activeSort);
    else params.delete("sort");

    if (activeOrder) params.set("order", activeOrder);
    else params.delete("order");

    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const isFiltering = search !== "" || status !== "all" || date !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-emerald-600" />
            Quality Check Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inspect manufactured orders, track pass/defect quantities, and hand off passed orders to packing.
          </p>
        </div>
      </div>

      {/* KPI Status Tabs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          onClick={() => {
            setStatus("all");
            applyFilters({ status: "all" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "all"
              ? "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">All Orders</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{statusCounts.all}</p>
        </button>

        <button
          onClick={() => {
            setStatus("ready_for_qc");
            applyFilters({ status: "ready_for_qc" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "ready_for_qc"
              ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-500"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Ready for QC</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{statusCounts.ready_for_qc}</p>
        </button>

        <button
          onClick={() => {
            setStatus("in_progress");
            applyFilters({ status: "in_progress" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "in_progress"
              ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">In Progress</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{statusCounts.in_progress}</p>
        </button>

        <button
          onClick={() => {
            setStatus("passed");
            applyFilters({ status: "passed" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "passed"
              ? "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Passed</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{statusCounts.passed}</p>
        </button>

        <button
          onClick={() => {
            setStatus("failed");
            applyFilters({ status: "failed" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "failed"
              ? "border-rose-600 bg-rose-50/50 ring-1 ring-rose-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Failed</p>
          <p className="text-xl font-bold text-rose-700 mt-1">{statusCounts.failed}</p>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order number or school name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                className="pl-9 h-9"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(val) => {
                  const nextVal = val || "all";
                  setStatus(nextVal);
                  applyFilters({ status: nextVal });
                }}
              >
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ready_for_qc">Ready for QC</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={date}
                onValueChange={(val) => {
                  const nextVal = val || "all";
                  setDate(nextVal);
                  applyFilters({ date: nextVal });
                }}
              >
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={`${sort}_${sortOrder}`}
                onValueChange={(val) => {
                  if (val) {
                    const [s, o] = val.split("_");
                    setSort(s);
                    setSortOrder(o);
                    applyFilters({ sort: s, order: o });
                  }
                }}
              >
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_desc">Recently Updated</SelectItem>
                  <SelectItem value="created_desc">Newest Orders</SelectItem>
                  <SelectItem value="created_asc">Oldest Orders</SelectItem>
                  <SelectItem value="order_asc">Order Number A-Z</SelectItem>
                  <SelectItem value="order_desc">Order Number Z-A</SelectItem>
                </SelectContent>
              </Select>

              <Button size="sm" onClick={() => applyFilters()} className="h-9 px-3">
                Filter
              </Button>

              {isFiltering && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setDate("all");
                    setSort("updated_at");
                    setSortOrder("desc");
                    router.push(pathname);
                  }}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-slate-900"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-700">
              Orders ({totalCount})
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {orders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-xs text-slate-700">Order Number</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">School</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Order Date</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700 text-center">Total Students</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700 text-center">Total Items</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">QC Status</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Last Updated</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500 text-sm">
                    {isFiltering
                      ? "No orders match your filter criteria."
                      : "No orders are currently under or ready for Quality Check."}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-medium text-slate-900">
                      <Link
                        href={`/admin/quality-check/${o.id}`}
                        className="hover:underline text-emerald-700 font-semibold"
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-700 max-w-[200px] truncate" title={o.schoolName}>
                      {o.schoolName}
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs">
                      {formatDate(o.createdAt)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-slate-800">
                      {o.totalStudents}
                    </TableCell>
                    <TableCell className="text-center font-medium text-slate-800">
                      {o.totalItems}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0.5 font-medium ${getQCBadgeColor(o.qcStatus)}`}
                      >
                        {QC_STATUS_LABELS[o.qcStatus] || o.qcStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs">
                      {formatDate(o.updatedAt, true)}
                    </TableCell>
                    <TableCell className="text-right">
                      {o.qcStatus === "ready_for_qc" || o.qcStatus === "pending" ? (
                        <Link href={`/admin/quality-check/${o.id}`}>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 h-8 text-xs font-medium"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start QC
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/admin/quality-check/${o.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-300 hover:bg-slate-100 gap-1 h-8 text-xs font-medium"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View QC
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-8 px-2"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
