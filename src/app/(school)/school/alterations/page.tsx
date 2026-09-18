"use client";

import React, { useState, useEffect } from "react";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scissors,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { NewAlterationDialog } from "./NewAlterationDialog";
import { AlterationDetailsDialog } from "./AlterationDetailsDialog";
import {
  getSchoolAlterationsSummary,
  getSchoolAlterationsList,
  AlterationsSummaryData,
  AlterationListItem,
} from "./actions";
import { ALTERATION_REASONS } from "./schema";

export default function AlterationsPage() {
  const [summary, setSummary] = useState<AlterationsSummaryData>({
    total: 0,
    requested: 0,
    under_review: 0,
    approved_rework: 0,
    completed: 0,
    rejected: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // List state
  const [alterations, setAlterations] = useState<AlterationListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "last_7_days" | "last_30_days" | "this_month"
  >("all");

  // Details dialog
  const [selectedAlterationId, setSelectedAlterationId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load summary
  const loadSummary = () => {
    setLoadingSummary(true);
    getSchoolAlterationsSummary().then((res) => {
      if (res.success) {
        setSummary(res.summary);
      }
      setLoadingSummary(false);
    });
  };

  // Load list
  const loadList = () => {
    setLoadingList(true);
    getSchoolAlterationsList({
      page,
      pageSize: 10,
      search: debouncedSearch,
      status: statusFilter,
      reason: reasonFilter,
      dateRange: dateFilter,
    }).then((res) => {
      if (res.success) {
        setAlterations(res.alterations);
        setTotalPages(res.totalPages);
        setTotalCount(res.totalCount);
      }
      setLoadingList(false);
    });
  };

  useEffect(() => {
    let ignore = false;
    getSchoolAlterationsSummary().then((res) => {
      if (!ignore) {
        if (res.success) {
          setSummary(res.summary);
        }
        setLoadingSummary(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  useRealtimeSubscription({
    table: "alteration_requests",
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setAlterations((prev) =>
          prev.map((alt) =>
            alt.id === updated.id
              ? {
                  ...alt,
                  status: (updated.status as string) || alt.status,
                }
              : alt
          )
        );
      }
      loadSummary();
      loadList();
    },
  });

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) setLoadingList(true);
      return getSchoolAlterationsList({
        page,
        pageSize: 10,
        search: debouncedSearch,
        status: statusFilter,
        reason: reasonFilter,
        dateRange: dateFilter,
      });
    }).then((res) => {
      if (!ignore) {
        if (res.success) {
          setAlterations(res.alterations);
          setTotalPages(res.totalPages);
          setTotalCount(res.totalCount);
        }
        setLoadingList(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [page, debouncedSearch, statusFilter, reasonFilter, dateFilter]);

  const handleRefresh = () => {
    loadSummary();
    loadList();
  };

  const handleViewDetails = (id: string) => {
    setSelectedAlterationId(id);
    setDetailsOpen(true);
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 uppercase text-xs font-semibold">
            Requested
          </Badge>
        );
      case "under_review":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 uppercase text-xs font-semibold">
            Under Review
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 uppercase text-xs font-semibold">
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 uppercase text-xs font-semibold">
            Rejected
          </Badge>
        );
      case "rework":
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100 uppercase text-xs font-semibold">
            Rework
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-100 uppercase text-xs font-semibold">
            Completed
          </Badge>
        );
      default:
        return <Badge variant="outline" className="uppercase text-xs">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Alterations & Rework</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Request corrections for uniforms already delivered to your school.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Refresh"
            disabled={loadingList || loadingSummary}
          >
            <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
          </Button>
          <NewAlterationDialog onSuccess={handleRefresh} />
        </div>
      </div>

      {/* Top Summary Cards (Section 4) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Requests
            </CardTitle>
            <Scissors className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {loadingSummary ? "..." : summary.total}
            </div>
            <p className="text-xs text-slate-400 mt-1">Across all delivered orders</p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-sm bg-blue-50/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Requested
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {loadingSummary ? "..." : summary.requested}
            </div>
            <p className="text-xs text-blue-600 mt-1">Awaiting admin review</p>
          </CardContent>
        </Card>

        <Card className="border-amber-100 shadow-sm bg-amber-50/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Under Review
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">
              {loadingSummary ? "..." : summary.under_review}
            </div>
            <p className="text-xs text-amber-600 mt-1">In EvenVive verification</p>
          </CardContent>
        </Card>

        <Card className="border-purple-100 shadow-sm bg-purple-50/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Approved / Rework
            </CardTitle>
            <RotateCcw className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">
              {loadingSummary ? "..." : summary.approved_rework}
            </div>
            <p className="text-xs text-purple-600 mt-1">Under correction</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-slate-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Completed
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {loadingSummary ? "..." : summary.completed}
            </div>
            <p className="text-xs text-slate-500 mt-1">Rework resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters (Section 19 & 20) */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search ID, order, student, adm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason Filter */}
            <div>
              <Select
                value={reasonFilter}
                onValueChange={(v) => {
                  setReasonFilter(v || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Reason: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Reason: All</SelectItem>
                  {ALTERATION_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Select
                value={dateFilter}
                onValueChange={(v) => {
                  setDateFilter((v as "all" | "today" | "last_7_days" | "last_30_days" | "this_month") || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Date: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Date: All</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Table (Section 18) */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-800">
            Alteration Requests ({totalCount})
          </CardTitle>
          <span className="text-xs text-slate-500">Sorted by Newest First</span>
        </CardHeader>
        <CardContent className="p-0">
          {loadingList ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="text-sm">Loading alteration requests...</span>
            </div>
          ) : alterations.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Scissors className="h-7 w-7 text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No requests found</h3>
              <p className="text-slate-500 text-sm max-w-sm">
                {debouncedSearch || statusFilter !== "all" || reasonFilter !== "all" || dateFilter !== "all"
                  ? "No alteration requests match your search or filter criteria."
                  : "No alteration requests have been submitted yet. Click [+ New Alteration Request] to create one."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request ID</th>
                    <th className="px-4 py-3 font-semibold">Order Number</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold text-center">Qty</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Requested Date</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alterations.map((alt) => (
                    <tr key={alt.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {alt.request_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {alt.order?.order_number || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {alt.student?.student_name || "-"}
                        </div>
                        <div className="text-xs text-slate-400">
                          Adm: {alt.student?.admission_number || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {alt.student ? `${alt.student.class_name}-${alt.student.section}` : "-"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 capitalize whitespace-nowrap">
                        <div>{alt.item_name}</div>
                        {alt.required_size && (
                          <div className="text-xs text-emerald-700 font-semibold">
                            Req: {alt.required_size}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                        {alt.issue_type}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-800">
                        {alt.quantity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderStatusBadge(alt.status)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {formatDate(alt.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(alt.id)}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-2.5 font-medium text-xs gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
              <div className="text-xs text-slate-500">
                Showing page <span className="font-semibold">{page}</span> of{" "}
                <span className="font-semibold">{totalPages}</span> ({totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loadingList}
                  className="h-8 px-2.5"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loadingList}
                  className="h-8 px-2.5"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <AlterationDetailsDialog
        alterationId={selectedAlterationId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
