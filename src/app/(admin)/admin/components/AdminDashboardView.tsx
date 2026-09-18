"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDashboardData } from "../types";
import DashboardKpiCard from "./DashboardKpiCard";
import OrderPipeline from "./OrderPipeline";
import RecentOrders from "./RecentOrders";
import SchoolOverview from "./SchoolOverview";
import QuickActions from "./QuickActions";
import ProductionOverview from "./ProductionOverview";
import QualityCheckOverview from "./QualityCheckOverview";
import PackingDeliveryOverview from "./PackingDeliveryOverview";
import {
  School,
  Users,
  ShoppingBag,
  Factory,
  Clock,
  ClipboardCheck,
  PackageCheck,
  Truck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";

interface AdminDashboardViewProps {
  data: AdminDashboardData;
  userRole: string;
}

export default function AdminDashboardView({ data, userRole }: AdminDashboardViewProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Realtime subscriptions to keep dashboard KPIs up to date
  useRealtimeRefresh({ table: "orders" });
  useRealtimeRefresh({ table: "production_records" });
  useRealtimeRefresh({ table: "quality_check_records" });
  useRealtimeRefresh({ table: "packing_records" });
  useRealtimeRefresh({ table: "alteration_requests" });

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const formattedTimestamp = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-serif">
            Operational Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time uniform manufacturing and order fulfillment overview. Logged in as{" "}
            <span className="font-semibold text-emerald-800 capitalize bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              {userRole.replace("_", " ")}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:inline-block">
            IST: {formattedTimestamp}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1.5 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Row 1: Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpiCard
          title="Active Schools"
          value={data.primaryKPIs.activeSchoolsCount}
          subtitle="Registered and approved"
          icon={School}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          href="/admin/schools"
        />

        <DashboardKpiCard
          title="Total Students"
          value={data.primaryKPIs.totalStudentsCount}
          subtitle="Across all active schools"
          icon={Users}
          iconBgClass="bg-blue-50"
          iconColorClass="text-blue-600"
          href="/admin/students"
        />

        <DashboardKpiCard
          title="Active Orders"
          value={data.primaryKPIs.activeOrdersCount}
          subtitle="Currently in progress"
          icon={ShoppingBag}
          iconBgClass="bg-indigo-50"
          iconColorClass="text-indigo-600"
          href="/admin/orders"
        />

        <DashboardKpiCard
          title="Orders in Production"
          value={data.primaryKPIs.ordersInProductionCount}
          subtitle="In manufacturing"
          icon={Factory}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          href="/admin/production"
        />
      </div>

      {/* Row 2: Secondary Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpiCard
          title="Pending Approvals"
          value={data.secondaryKPIs.pendingSchoolsCount}
          subtitle="Awaiting onboarding approval"
          icon={Clock}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          href="/admin/schools"
          badge={
            data.secondaryKPIs.pendingSchoolsCount > 0
              ? { text: "Action Needed", className: "bg-amber-100 text-amber-800" }
              : undefined
          }
        />

        <DashboardKpiCard
          title="QC Pending"
          value={data.secondaryKPIs.qcPendingCount}
          subtitle="Awaiting quality check"
          icon={ClipboardCheck}
          iconBgClass="bg-purple-50"
          iconColorClass="text-purple-600"
          href="/admin/quality-check"
        />

        <DashboardKpiCard
          title="Packing Pending"
          value={data.secondaryKPIs.packingPendingCount}
          subtitle="Ready for dispatch"
          icon={PackageCheck}
          iconBgClass="bg-teal-50"
          iconColorClass="text-teal-600"
          href="/admin/packing-delivery"
        />

        <DashboardKpiCard
          title="Delivery Pending"
          value={data.secondaryKPIs.deliveryPendingCount}
          subtitle="On the way"
          icon={Truck}
          iconBgClass="bg-cyan-50"
          iconColorClass="text-cyan-600"
          href="/admin/packing-delivery"
        />
      </div>

      {/* Quick Actions Bar */}
      <QuickActions />

      {/* Order Pipeline */}
      <OrderPipeline stages={data.pipelineStages} />

      {/* Operational Summaries Grid (3 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProductionOverview data={data.productionOverview} />
        <QualityCheckOverview data={data.qcOverview} />
        <PackingDeliveryOverview data={data.packingDeliveryOverview} />
      </div>

      {/* Detailed Tables Section */}
      <div className="space-y-6">
        <RecentOrders orders={data.recentOrders} />
        <SchoolOverview schools={data.schoolOverview} />
      </div>
    </div>
  );
}
