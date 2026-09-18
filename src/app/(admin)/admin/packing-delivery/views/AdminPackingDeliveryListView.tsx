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
import { Search, Truck, ChevronLeft, ChevronRight, Eye, Play } from "lucide-react";
import Link from "next/link";

const formatDate = (dateString: string | null, includeTime = false) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

export const DELIVERY_CATEGORY_LABELS: Record<string, string> = {
  ready_for_packing: "Ready for Packing",
  packing_in_progress: "Packing In Progress",
  packed: "Packed",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
};

export const getDeliveryBadgeColor = (category: string) => {
  switch (category) {
    case "ready_for_packing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "packing_in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "packed":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "dispatched":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "in_transit":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export interface PackingDeliveryRow {
  id: string;
  orderNumber: string;
  schoolName: string;
  orderStatus: string;
  deliveryCategory:
    | "ready_for_packing"
    | "packing_in_progress"
    | "packed"
    | "dispatched"
    | "in_transit"
    | "delivered";
  packingStatus: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalStudents: number;
  totalItems: number;
  totalQuantity: number;
  packedQuantity: number;
  hasPackingRecord: boolean;
}

export default function AdminPackingDeliveryListView({
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
  orders: PackingDeliveryRow[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  statusCounts: {
    all: number;
    ready_for_packing: number;
    packing_in_progress: number;
    packed: number;
    dispatched: number;
    in_transit: number;
    delivered: number;
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

  const [orders, setOrders] = useState<PackingDeliveryRow[]>(initialOrders);

  useRealtimeSubscription({
    table: "orders",
    onEvent: (payload) => {
      if (payload.new) {
        const ord = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === ord.id) {
              const status = (ord.status as string) || o.orderStatus;
              let cat = o.deliveryCategory;
              if (status === "dispatched") cat = "dispatched";
              else if (status === "in_transit") cat = "in_transit";
              else if (status === "delivered") cat = "delivered";
              return {
                ...o,
                orderStatus: status,
                deliveryCategory: cat,
                courierName: (ord.courier_name as string) ?? o.courierName,
                trackingNumber: (ord.tracking_number as string) ?? o.trackingNumber,
                estimatedDelivery: (ord.estimated_delivery as string) ?? o.estimatedDelivery,
                shippedAt: (ord.shipped_at as string) ?? o.shippedAt,
                deliveredAt: (ord.delivered_at as string) ?? o.deliveredAt,
                updatedAt: (ord.updated_at as string) || o.updatedAt,
              };
            }
            return o;
          })
        );
      }
    },
  });

  useRealtimeSubscription({
    table: "packing_records",
    onEvent: (payload) => {
      if (payload.new) {
        const rec = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === rec.order_id) {
              const pStatus = (rec.status as string) || o.packingStatus;
              let cat = o.deliveryCategory;
              if (o.orderStatus === "packed") {
                if (pStatus === "in_progress") cat = "packing_in_progress";
                else if (pStatus === "completed") cat = "packed";
              }
              return {
                ...o,
                packingStatus: pStatus,
                deliveryCategory: cat,
                totalQuantity: Number(rec.total_quantity) || o.totalQuantity,
                packedQuantity: Number(rec.packed_quantity) || o.packedQuantity,
                hasPackingRecord: true,
                updatedAt: (rec.updated_at as string) || o.updatedAt,
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
            <Truck className="h-6 w-6 text-emerald-600" />
            Packing & Delivery Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pack verified orders with standardized checklists, assign couriers, and track end-to-end fulfillment through delivery.
          </p>
        </div>
      </div>

      {/* KPI Status Tabs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
            setStatus("ready_for_packing");
            applyFilters({ status: "ready_for_packing" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "ready_for_packing"
              ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-500"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Ready for Packing</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{statusCounts.ready_for_packing}</p>
        </button>

        <button
          onClick={() => {
            setStatus("packing_in_progress");
            applyFilters({ status: "packing_in_progress" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "packing_in_progress"
              ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">In Progress</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{statusCounts.packing_in_progress}</p>
        </button>

        <button
          onClick={() => {
            setStatus("packed");
            applyFilters({ status: "packed" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "packed"
              ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Packed</p>
          <p className="text-xl font-bold text-teal-700 mt-1">{statusCounts.packed}</p>
        </button>

        <button
          onClick={() => {
            setStatus("dispatched");
            applyFilters({ status: "dispatched" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "dispatched"
              ? "border-purple-600 bg-purple-50/50 ring-1 ring-purple-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Dispatched</p>
          <p className="text-xl font-bold text-purple-700 mt-1">{statusCounts.dispatched}</p>
        </button>

        <button
          onClick={() => {
            setStatus("in_transit");
            applyFilters({ status: "in_transit" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "in_transit"
              ? "border-sky-600 bg-sky-50/50 ring-1 ring-sky-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">In Transit</p>
          <p className="text-xl font-bold text-sky-700 mt-1">{statusCounts.in_transit}</p>
        </button>

        <button
          onClick={() => {
            setStatus("delivered");
            applyFilters({ status: "delivered" });
          }}
          className={`p-3 rounded-lg border text-left transition-all ${
            status === "delivered"
              ? "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Delivered</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{statusCounts.delivered}</p>
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
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="Delivery Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ready_for_packing">Ready for Packing</SelectItem>
                  <SelectItem value="packing_in_progress">Packing In Progress</SelectItem>
                  <SelectItem value="packed">Packed</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
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
                <TableHead className="font-semibold text-xs text-slate-700">Delivery Status</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Courier</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Tracking Number</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700">Last Updated</TableHead>
                <TableHead className="font-semibold text-xs text-slate-700 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-500 text-sm">
                    {isFiltering
                      ? "No orders match your filter criteria."
                      : "No orders are currently in Packing & Delivery."}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-medium text-slate-900">
                      <Link
                        href={`/admin/packing-delivery/${o.id}`}
                        className="hover:underline text-emerald-700 font-semibold"
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-700 max-w-[180px] truncate" title={o.schoolName}>
                      {o.schoolName}
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs whitespace-nowrap">
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
                        className={`text-xs px-2 py-0.5 font-medium whitespace-nowrap ${getDeliveryBadgeColor(
                          o.deliveryCategory
                        )}`}
                      >
                        {DELIVERY_CATEGORY_LABELS[o.deliveryCategory] || o.deliveryCategory}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700 text-xs max-w-[120px] truncate">
                      {o.courierName || "—"}
                    </TableCell>
                    <TableCell className="text-slate-700 text-xs font-mono max-w-[130px] truncate">
                      {o.trackingNumber || "—"}
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs whitespace-nowrap">
                      {formatDate(o.updatedAt, true)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {o.deliveryCategory === "ready_for_packing" ? (
                        <Link href={`/admin/packing-delivery/${o.id}`}>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 h-8 text-xs font-medium"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start Packing
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/admin/packing-delivery/${o.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-300 hover:bg-slate-100 gap-1 h-8 text-xs font-medium"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Packing & Delivery
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
