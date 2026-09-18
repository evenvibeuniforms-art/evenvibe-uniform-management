"use client";

import { useState, useTransition, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  Building2,
  Users,
  Layers,
  ShoppingCart,
  Factory,
  ClipboardCheck,
  Package,
  Truck,
  Search,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  GlobalReportFilters,
  DateFilterOption,
  DashboardKPISummary,
  OrderStatusCount,
  QualitySummaryKPI,
  DeliverySummaryKPI,
  SchoolPerformanceRow,
  StudentReportRow,
  UniformSizeReportItem,
  OrderReportRow,
  ProductionReportRow,
  QualityCheckReportRow,
  PackingReportRow,
  DeliveryReportRow,
  PaginatedResult,
  SchoolOption,
} from "../types";
import { ReportDateFilter } from "./components/ReportDateFilter";
import { OverviewReportTab } from "./tabs/OverviewReportTab";
import { SchoolReportTab } from "./tabs/SchoolReportTab";
import { StudentReportTab } from "./tabs/StudentReportTab";
import { UniformSizeReportTab } from "./tabs/UniformSizeReportTab";
import { OrderReportTab } from "./tabs/OrderReportTab";
import { ProductionReportTab } from "./tabs/ProductionReportTab";
import { QualityCheckReportTab } from "./tabs/QualityCheckReportTab";
import { PackingReportTab } from "./tabs/PackingReportTab";
import { DeliveryReportTab } from "./tabs/DeliveryReportTab";
import {
  getDashboardKPISummary,
  getSchoolPerformanceReport,
  getStudentReport,
  getUniformSizeReport,
  getOrderReport,
  getProductionReport,
  getQualityCheckReport,
  getPackingReport,
  getDeliveryReport,
} from "../actions";

interface AdminReportsViewProps {
  schools: SchoolOption[];
  initialOverview: {
    summary: DashboardKPISummary;
    statusDistribution: OrderStatusCount[];
    qualitySummary: QualitySummaryKPI;
    deliverySummary: DeliverySummaryKPI;
  };
  initialSchoolReport: PaginatedResult<SchoolPerformanceRow>;
  initialStudentReport: PaginatedResult<StudentReportRow>;
  initialUniformSizeReport: PaginatedResult<UniformSizeReportItem>;
  initialOrderReport: PaginatedResult<OrderReportRow>;
  initialProductionReport: PaginatedResult<ProductionReportRow>;
  initialQualityCheckReport: PaginatedResult<QualityCheckReportRow>;
  initialPackingReport: PaginatedResult<PackingReportRow>;
  initialDeliveryReport: PaginatedResult<DeliveryReportRow>;
}

export default function AdminReportsView({
  schools,
  initialOverview,
  initialSchoolReport,
  initialStudentReport,
  initialUniformSizeReport,
  initialOrderReport,
  initialProductionReport,
  initialQualityCheckReport,
  initialPackingReport,
  initialDeliveryReport,
}: AdminReportsViewProps) {
  const [activeTab, setActiveTab] = useState("overview");

  // Global filters
  const [dateFilter, setDateFilter] = useState<DateFilterOption>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  // State data for each tab
  const [overview, setOverview] = useState(initialOverview);
  const [schoolReport, setSchoolReport] = useState(initialSchoolReport);
  const [studentReport, setStudentReport] = useState(initialStudentReport);
  const [uniformSizeReport, setUniformSizeReport] = useState(initialUniformSizeReport);
  const [orderReport, setOrderReport] = useState(initialOrderReport);
  const [productionReport, setProductionReport] = useState(initialProductionReport);
  const [qualityCheckReport, setQualityCheckReport] = useState(initialQualityCheckReport);
  const [packingReport, setPackingReport] = useState(initialPackingReport);
  const [deliveryReport, setDeliveryReport] = useState(initialDeliveryReport);

  // Tab pagination states
  const [schoolPage, setSchoolPage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const [uniformSizePage, setUniformSizePage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [productionPage, setProductionPage] = useState(1);
  const [qcPage, setQcPage] = useState(1);
  const [packingPage, setPackingPage] = useState(1);
  const [deliveryPage, setDeliveryPage] = useState(1);

  const getActiveFilters = useCallback((): GlobalReportFilters => ({
    dateFilter,
    customStartDate: customStart,
    customEndDate: customEnd,
    schoolId: schoolId === "all" ? undefined : schoolId,
    searchQuery: searchQuery.trim() || undefined,
  }), [dateFilter, customStart, customEnd, schoolId, searchQuery]);

  // Refresh current tab data
  const refreshTabData = useCallback((tab: string, pageOverride?: number) => {
    const filters = getActiveFilters();
    startTransition(async () => {
      if (tab === "overview") {
        const res = await getDashboardKPISummary(filters);
        setOverview(res);
      } else if (tab === "schools") {
        const p = pageOverride ?? schoolPage;
        const res = await getSchoolPerformanceReport(filters, { page: p, pageSize: 10 });
        setSchoolReport(res);
      } else if (tab === "students") {
        const p = pageOverride ?? studentPage;
        const res = await getStudentReport(filters, { page: p, pageSize: 10 });
        setStudentReport(res);
      } else if (tab === "uniform_sizes") {
        const p = pageOverride ?? uniformSizePage;
        const res = await getUniformSizeReport(filters, { page: p, pageSize: 10 });
        setUniformSizeReport(res);
      } else if (tab === "orders") {
        const p = pageOverride ?? orderPage;
        const res = await getOrderReport(filters, { page: p, pageSize: 10 });
        setOrderReport(res);
      } else if (tab === "production") {
        const p = pageOverride ?? productionPage;
        const res = await getProductionReport(filters, { page: p, pageSize: 10 });
        setProductionReport(res);
      } else if (tab === "quality_check") {
        const p = pageOverride ?? qcPage;
        const res = await getQualityCheckReport(filters, { page: p, pageSize: 10 });
        setQualityCheckReport(res);
      } else if (tab === "packing") {
        const p = pageOverride ?? packingPage;
        const res = await getPackingReport(filters, { page: p, pageSize: 10 });
        setPackingReport(res);
      } else if (tab === "delivery") {
        const p = pageOverride ?? deliveryPage;
        const res = await getDeliveryReport(filters, { page: p, pageSize: 10 });
        setDeliveryReport(res);
      }
    });
  }, [
    getActiveFilters,
    schoolPage,
    studentPage,
    uniformSizePage,
    orderPage,
    productionPage,
    qcPage,
    packingPage,
    deliveryPage,
  ]);

  const handleDateChange = (preset: DateFilterOption, start?: string, end?: string) => {
    setDateFilter(preset);
    if (start) setCustomStart(start);
    if (end) setCustomEnd(end);
    // Trigger refresh for current tab
    setTimeout(() => refreshTabData(activeTab), 50);
  };

  const handleSchoolChange = (val: string | null) => {
    setSchoolId(val || "all");
    setTimeout(() => refreshTabData(activeTab), 50);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refreshTabData(activeTab, 1);
  };

  const handleResetFilters = () => {
    setDateFilter("all");
    setCustomStart("");
    setCustomEnd("");
    setSchoolId("all");
    setSearchQuery("");
    setTimeout(() => {
      refreshTabData(activeTab, 1);
    }, 50);
  };

  const handleTabChange = (nextTab: string) => {
    setActiveTab(nextTab);
    refreshTabData(nextTab);
  };

  const activeFilters = getActiveFilters();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-600" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Business reports and operational insights across schools, orders, production, quality, packing, and delivery.
          </p>
        </div>
      </div>

      {/* Global Filter Bar */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Date Presets & School Selector */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Filter */}
              <ReportDateFilter
                value={dateFilter}
                customStartDate={customStart}
                customEndDate={customEnd}
                onChange={handleDateChange}
              />

              {/* School Filter */}
              <div className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" />
                <Select value={schoolId} onValueChange={handleSchoolChange}>
                  <SelectTrigger className="w-[180px] h-9 text-xs bg-white">
                    <SelectValue placeholder="All Schools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Partner Schools</SelectItem>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Search & Actions */}
            <div className="flex items-center gap-2">
              <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-[240px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search number, school, student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs bg-white"
                />
              </form>

              <Button
                size="sm"
                onClick={() => refreshTabData(activeTab, 1)}
                className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </Button>

              {(dateFilter !== "all" || schoolId !== "all" || searchQuery !== "") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-slate-900"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 9 Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="overflow-x-auto border-b border-slate-200">
          <TabsList className="inline-flex w-full justify-start h-auto p-1 bg-slate-100/80 rounded-lg space-x-1 min-w-[760px]">
            <TabsTrigger value="overview" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="schools" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Building2 className="h-4 w-4 text-blue-600" />
              Schools
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="h-4 w-4 text-indigo-600" />
              Students
            </TabsTrigger>
            <TabsTrigger value="uniform_sizes" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Layers className="h-4 w-4 text-emerald-600" />
              Uniform Sizes
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <ShoppingCart className="h-4 w-4 text-teal-600" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Factory className="h-4 w-4 text-indigo-600" />
              Production
            </TabsTrigger>
            <TabsTrigger value="quality_check" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <ClipboardCheck className="h-4 w-4 text-purple-600" />
              Quality Check
            </TabsTrigger>
            <TabsTrigger value="packing" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Package className="h-4 w-4 text-teal-600" />
              Packing
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-1.5 text-xs py-2 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Truck className="h-4 w-4 text-emerald-600" />
              Delivery
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <OverviewReportTab
            kpi={overview.summary}
            distribution={overview.statusDistribution}
            quality={overview.qualitySummary}
            delivery={overview.deliverySummary}
            schoolComparison={schoolReport.data}
          />
        </TabsContent>

        {/* Tab 2: Schools */}
        <TabsContent value="schools" className="mt-6">
          <SchoolReportTab
            report={schoolReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setSchoolPage(p);
              refreshTabData("schools", p);
            }}
          />
        </TabsContent>

        {/* Tab 3: Students */}
        <TabsContent value="students" className="mt-6">
          <StudentReportTab
            report={studentReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setStudentPage(p);
              refreshTabData("students", p);
            }}
          />
        </TabsContent>

        {/* Tab 4: Uniform Sizes */}
        <TabsContent value="uniform_sizes" className="mt-6">
          <UniformSizeReportTab
            report={uniformSizeReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setUniformSizePage(p);
              refreshTabData("uniform_sizes", p);
            }}
          />
        </TabsContent>

        {/* Tab 5: Orders */}
        <TabsContent value="orders" className="mt-6">
          <OrderReportTab
            report={orderReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setOrderPage(p);
              refreshTabData("orders", p);
            }}
          />
        </TabsContent>

        {/* Tab 6: Production */}
        <TabsContent value="production" className="mt-6">
          <ProductionReportTab
            report={productionReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setProductionPage(p);
              refreshTabData("production", p);
            }}
          />
        </TabsContent>

        {/* Tab 7: Quality Check */}
        <TabsContent value="quality_check" className="mt-6">
          <QualityCheckReportTab
            report={qualityCheckReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setQcPage(p);
              refreshTabData("quality_check", p);
            }}
          />
        </TabsContent>

        {/* Tab 8: Packing */}
        <TabsContent value="packing" className="mt-6">
          <PackingReportTab
            report={packingReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setPackingPage(p);
              refreshTabData("packing", p);
            }}
          />
        </TabsContent>

        {/* Tab 9: Delivery */}
        <TabsContent value="delivery" className="mt-6">
          <DeliveryReportTab
            report={deliveryReport}
            filters={activeFilters}
            onPageChange={(p) => {
              setDeliveryPage(p);
              refreshTabData("delivery", p);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
