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
import { Search, Factory, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import Link from "next/link";

const formatDate = (dateString: string, includeTime = false) => {
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const STAGE_LABELS: Record<string, string> = {
  ready_to_start: "Ready to Start",
  production_started: "Production Started",
  cutting: "Cutting",
  stitching: "Stitching",
  finishing: "Finishing",
  production_completed: "Production Completed",
};

const getStageBadgeColor = (stage: string) => {
  switch (stage) {
    case "ready_to_start":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "production_started":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "cutting":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "stitching":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "finishing":
      return "bg-pink-100 text-pink-800 border-pink-200";
    case "production_completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export default function AdminProductionListView({
  orders: initialOrders,
  totalCount,
  currentPage,
  pageSize,
  search: initialSearch,
  status: initialStatus,
  date: initialDate,
  sort: initialSort,
  order: initialOrder,
}: {
  orders: {
    id: string;
    orderNumber: string;
    schoolName: string;
    orderStatus: string;
    stage: string;
    createdAt: string;
    updatedAt: string;
    totalStudents: number;
    totalItems: number;
    completedQuantity: number;
    progressPercent: number;
    hasProductionRecord: boolean;
  }[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  search?: string;
  status?: string;
  date?: string;
  sort?: string;
  order?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState(initialOrders);

  useRealtimeSubscription({
    table: "production_records",
    onEvent: (payload) => {
      if (payload.new) {
        const rec = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === rec.order_id) {
              const completedQty = Number(rec.completed_quantity) || 0;
              const total = o.totalItems || Number(rec.total_quantity) || 1;
              return {
                ...o,
                stage: (rec.stage as string) || o.stage,
                completedQuantity: completedQty,
                progressPercent: total > 0 ? Math.round((completedQty / total) * 100) : o.progressPercent,
                hasProductionRecord: true,
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
            <Factory className="h-6 w-6 text-emerald-600" />
            Production Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage confirmed orders and track production progress.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Production Queue</CardTitle>
          <CardDescription>
            Active orders ready for manufacturing and currently on the factory floor.
          </CardDescription>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order # or school name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters({ search });
                }}
                className="pl-9 bg-white"
              />
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={status}
                onValueChange={(val) => {
                  const nextVal = val || "all";
                  setStatus(nextVal);
                  applyFilters({ status: nextVal });
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ready_to_start">Ready to Start</SelectItem>
                  <SelectItem value="production_started">Production Started</SelectItem>
                  <SelectItem value="cutting">Cutting</SelectItem>
                  <SelectItem value="stitching">Stitching</SelectItem>
                  <SelectItem value="finishing">Finishing</SelectItem>
                  <SelectItem value="production_completed">Production Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Select
                value={date}
                onValueChange={(val) => {
                  const nextVal = val || "all";
                  setDate(nextVal);
                  applyFilters({ date: nextVal });
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Filter */}
            <div>
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
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_at_desc">Recently Updated</SelectItem>
                  <SelectItem value="created_at_desc">Newest Orders</SelectItem>
                  <SelectItem value="created_at_asc">Oldest Orders</SelectItem>
                  <SelectItem value="order_number_asc">Order # (A-Z)</SelectItem>
                  <SelectItem value="order_number_desc">Order # (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-700">Order Number</TableHead>
                  <TableHead className="font-semibold text-slate-700">School</TableHead>
                  <TableHead className="font-semibold text-slate-700">Order Date</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total Students</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total Items</TableHead>
                  <TableHead className="font-semibold text-slate-700">Production Status</TableHead>
                  <TableHead className="font-semibold text-slate-700">Last Updated</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                      {isFiltering
                        ? "No production orders match your filters."
                        : "No orders are ready for production yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-medium text-slate-900">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>{order.schoolName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {order.totalStudents}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {order.totalItems}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={`w-fit px-2 py-0.5 text-xs font-semibold ${getStageBadgeColor(
                              order.stage
                            )}`}
                          >
                            {STAGE_LABELS[order.stage] || order.stage}
                          </Badge>
                          {order.hasProductionRecord && (
                            <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${order.progressPercent}%` }}
                              />
                            </div>
                          )}
                          {order.hasProductionRecord && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {order.completedQuantity}/{order.totalItems} ({order.progressPercent}%)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(order.updatedAt, true)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/production/${order.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 border-slate-300 hover:bg-slate-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Production
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, totalCount)} of {totalCount} production orders
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="h-8 gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-xs font-medium px-2">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="h-8 gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
