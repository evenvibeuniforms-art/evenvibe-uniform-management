import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RecentOrderSummary } from "../types";
import { ArrowRight, Eye, FileText, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentOrdersProps {
  orders: RecentOrderSummary[];
}

const formatIndianDate = (dateString: string) => {
  if (!dateString) return "--";
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return dateString;
  }
};

const formatStatusLabel = (status: string) => {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case "submitted":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "under_review":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "confirmed":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "production":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "quality_check":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "packed":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "dispatched":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "in_transit":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
};

export default function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white">
      <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg font-semibold text-slate-900">
              Recent Orders
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Latest school uniform orders and fulfillment status
          </CardDescription>
        </div>

        <Link
          href="/admin/orders"
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
        >
          All Orders
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow className="border-b border-slate-200/80">
                <TableHead className="w-[140px] text-xs font-semibold text-slate-600">Order Number</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">School</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Order Date</TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600">Students</TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600">Items</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500 text-sm">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900">
                          {order.order_number}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 font-medium">
                      {order.school_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {formatIndianDate(order.created_at)}
                    </TableCell>
                    <TableCell className="text-center text-sm font-semibold text-slate-800">
                      {order.students_count}
                    </TableCell>
                    <TableCell className="text-center text-sm font-semibold text-slate-800">
                      {order.items_count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("px-2.5 py-0.5 text-xs font-medium border", getStatusBadgeStyle(order.status))}
                      >
                        {formatStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 h-8 px-2.5 inline-flex items-center"
                        )}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
