"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Search, FileText } from "lucide-react";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  schoolName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalQuantity: number;
}

export interface AdminSchoolOption {
  id: string;
  name: string;
}

const formatDate = (dateString: string, includeTime = false) => {
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const STATUS_OPTIONS = [
  { value: "all_statuses", label: "All Statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "production", label: "Production" },
  { value: "quality_check", label: "Quality Check" },
  { value: "packed", label: "Packed" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";

export default function AdminOrdersListView({
  orders: initialOrders,
  totalCount,
  schools,
  currentPage,
  pageSize,
  search: initialSearch,
  schoolId: initialSchoolId,
  status: initialStatus,
  sort: initialSort,
  order: initialOrder,
}: {
  orders: AdminOrderListItem[];
  totalCount: number;
  schools: AdminSchoolOption[];
  currentPage: number;
  pageSize: number;
  search?: string;
  schoolId?: string;
  status?: string;
  sort?: string;
  order?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<AdminOrderListItem[]>(initialOrders);

  useRealtimeSubscription({
    table: "orders",
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setOrders((prev) =>
          prev.map((o) =>
            o.id === updated.id
              ? {
                  ...o,
                  status: (updated.status as string) || o.status,
                  updatedAt: (updated.updated_at as string) || new Date().toISOString(),
                }
              : o
          )
        );
      } else if (payload.eventType === "INSERT") {
        router.refresh();
      }
    },
  });

  const [search, setSearch] = useState(initialSearch);
  const [schoolId, setSchoolId] = useState(initialSchoolId || "");
  const [status, setStatus] = useState(initialStatus || "all_statuses");
  
  const totalPages = Math.ceil(totalCount / pageSize);

  const applyFilters = (newOverrides: { search?: string; schoolId?: string; status?: string } = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (newOverrides.search !== undefined) {
      if (newOverrides.search) params.set("search", newOverrides.search);
      else params.delete("search");
    } else {
      if (search) params.set("search", search);
      else params.delete("search");
    }

    if (newOverrides.schoolId !== undefined) {
      if (newOverrides.schoolId && newOverrides.schoolId !== "") params.set("schoolId", newOverrides.schoolId);
      else params.delete("schoolId");
    } else {
      if (schoolId && schoolId !== "") params.set("schoolId", schoolId);
      else params.delete("schoolId");
    }

    if (newOverrides.status !== undefined) {
      if (newOverrides.status && newOverrides.status !== "all_statuses") params.set("status", newOverrides.status);
      else params.delete("status");
    } else {
      if (status && status !== "all_statuses") params.set("status", status);
      else params.delete("status");
    }
    
    params.set("page", "1"); // Reset to page 1 on filter
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (initialSort === field && initialOrder === "asc") {
      params.set("sort", field);
      params.set("order", "desc");
    } else {
      params.set("sort", field);
      params.set("order", "asc");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const formatStatus = (s: string) => {
    return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };
  
  const getStatusColor = (s: string) => {
    switch (s) {
      case "submitted": return "bg-blue-100 text-blue-800 border-blue-200";
      case "under_review": return "bg-amber-100 text-amber-800 border-amber-200";
      case "confirmed": return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
      case "production": return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
      case "quality_check": return "bg-pink-100 text-pink-800 border-pink-200";
      case "packed": return "bg-orange-100 text-orange-800 border-orange-200";
      case "dispatched": return "bg-cyan-100 text-cyan-800 border-cyan-200";
      case "in_transit": return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
      case "delivered": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      default: return "bg-slate-100 text-slate-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage school uniform orders and track their progress through the manufacturing lifecycle.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Orders List</CardTitle>
          <CardDescription>View and filter all orders across schools.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by Order Number..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>
            </div>
            <div className="w-full md:w-[250px] min-w-0">
              <Select value={schoolId || "all_schools"} onValueChange={(val: string | null) => {
                const newVal = val === "all_schools" || !val ? "" : val;
                setSchoolId(newVal); 
                applyFilters({ schoolId: newVal }); 
              }}>
                <SelectTrigger className="w-full min-w-0 h-9 bg-white border-slate-200 text-sm justify-between">
                  <SelectValue placeholder="All Schools" className="min-w-0 truncate text-left">
                    {(val: unknown) => {
                      const activeId = typeof val === "string" && val.length > 0 ? val : (schoolId || "all_schools");
                      if (!activeId || activeId === "all_schools") return "All Schools";
                      const found = schools.find((s) => s.id === activeId);
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
                  <SelectItem value="all_schools">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-[200px]">
              <Select value={status || "all_statuses"} onValueChange={(val: string | null) => {
                const newVal = val === "all_statuses" || !val ? "" : val;
                setStatus(newVal); 
                applyFilters({ status: newVal }); 
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" onClick={() => applyFilters()}>
              Filter
            </Button>
          </div>

          <div className="rounded-md border">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort("order_number")}>
                      Order Number {initialSort === "order_number" && (initialOrder === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead>School</TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort("created_at")}>
                      Submitted Date {initialSort === "created_at" && (initialOrder === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort("status")}>
                      Status {initialSort === "status" && (initialOrder === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort("updated_at")}>
                      Last Updated {initialSort === "updated_at" && (initialOrder === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No orders found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            {order.orderNumber}
                          </div>
                        </TableCell>
                        <TableCell>{order.schoolName}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>{order.totalQuantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(order.status)}>
                            {formatStatus(order.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(order.updatedAt, true)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/orders/${order.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
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
            <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
              {orders.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No orders found.</div>
              ) : (
                orders.map((order) => (
                  <MobileCard key={order.id}>
                    <MobileCardField
                      label="Order Number"
                      value={
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <FileText className="h-4 w-4 text-slate-400" />
                          {order.orderNumber}
                        </div>
                      }
                    />
                    <MobileCardField label="School" value={order.schoolName} />
                    <MobileCardField label="Submitted Date" value={formatDate(order.createdAt)} />
                    <MobileCardField label="Total Qty" value={<span className="font-semibold text-slate-900">{order.totalQuantity}</span>} />
                    <MobileCardField
                      label="Status"
                      value={
                        <Badge variant="outline" className={getStatusColor(order.status)}>
                          {formatStatus(order.status)}
                        </Badge>
                      }
                    />
                    <MobileCardField label="Last Updated" value={formatDate(order.updatedAt, true)} />
                    <MobileCardActions label="Action">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/orders/${order.id}`)}
                        className="w-full text-evenvibe-primary border-emerald-200 hover:bg-emerald-50 h-8 gap-1.5 justify-center"
                      >
                        <Eye className="h-4 w-4" />
                        View Order
                      </Button>
                    </MobileCardActions>
                  </MobileCard>
                ))
              )}
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} orders
              </div>
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
