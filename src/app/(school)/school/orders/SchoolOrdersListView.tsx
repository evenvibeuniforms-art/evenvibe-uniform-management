"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrderListItem } from "./actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PackageSearch, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import Link from "next/link";

const statusColors: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-purple-100 text-purple-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  production: "bg-amber-100 text-amber-800",
  quality_check: "bg-orange-100 text-orange-800",
  packed: "bg-cyan-100 text-cyan-800",
  dispatched: "bg-teal-100 text-teal-800",
  in_transit: "bg-emerald-100 text-emerald-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Being Reviewed",
  confirmed: "Confirmed",
  production: "Production",
  quality_check: "Quality Checking",
  packed: "Packed",
  dispatched: "Dispatched",
  in_transit: "On the Way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

import { OrderStatus } from "./actions";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";

export function SchoolOrdersListView({
  orders: initialOrders,
  pagination,
}: {
  orders: OrderListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);

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
                  status: (updated.status as OrderStatus) || o.status,
                  updated_at: (updated.updated_at as string) || new Date().toISOString(),
                }
              : o
          )
        );
      } else if (payload.eventType === "INSERT") {
        router.refresh();
      }
    },
  });

  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (searchTerm) {
      params.set("search", searchTerm);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`/school/orders?${params.toString()}`);
  };

  const handleStatusChange = (val: string | null) => {
    if (!val) return;
    const params = new URLSearchParams(searchParams.toString());
    if (val !== "all") {
      params.set("status", val);
    } else {
      params.delete("status");
    }
    params.set("page", "1");
    router.push(`/school/orders?${params.toString()}`);
  };

  const handleDateSortChange = (val: string | null) => {
    if (!val) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateSort", val);
    params.set("page", "1");
    router.push(`/school/orders?${params.toString()}`);
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/school/orders?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Orders</h1>
          <p className="text-slate-500 mt-1">View and track your submitted uniform orders.</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by order number..."
                className="pl-9 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="flex w-full sm:w-auto items-center gap-3">
              <Select defaultValue={searchParams.get("status") || "all"} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px] bg-white">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select defaultValue={searchParams.get("dateSort") || "desc"} onValueChange={handleDateSortChange}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue placeholder="Sort Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                <PackageSearch className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">No orders found</h3>
              <p className="text-slate-500 max-w-sm">
                You have not submitted any orders yet, or no orders match your search criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-slate-50/50">
                    <TableHead className="w-[200px]">Order Number</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead className="text-center">Total Students</TableHead>
                    <TableHead className="text-center">Total Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const totalItems = order.requirement.requirement_items.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium text-slate-900">{order.order_number}</TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-center text-slate-700">{order.requirement.total_students}</TableCell>
                        <TableCell className="text-center text-slate-700">{totalItems}</TableCell>
                        <TableCell>
                          <Badge className={`${statusColors[order.status] || "bg-slate-100 text-slate-800"} hover:opacity-80 border-0`}>
                            {statusLabels[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(order.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/school/orders/${order.id}`}>
                            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-4">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
