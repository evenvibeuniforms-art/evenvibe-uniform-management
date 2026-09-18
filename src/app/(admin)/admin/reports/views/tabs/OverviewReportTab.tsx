import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DashboardKPISummary,
  OrderStatusCount,
  QualitySummaryKPI,
  DeliverySummaryKPI,
  SchoolPerformanceRow,
} from "../../types";
import { ReportKPICard } from "../components/ReportKPICard";
import { DistributionBarChart } from "../components/DistributionBarChart";
import {
  Building2,
  Users,
  ShoppingCart,
  Layers,
  Factory,
  ClipboardCheck,
  Package,
  Truck,
} from "lucide-react";

interface OverviewReportTabProps {
  kpi: DashboardKPISummary;
  distribution: OrderStatusCount[];
  quality: QualitySummaryKPI;
  delivery: DeliverySummaryKPI;
  schoolComparison: SchoolPerformanceRow[];
}

export function OverviewReportTab({
  kpi,
  distribution,
  quality,
  delivery,
  schoolComparison,
}: OverviewReportTabProps) {
  return (
    <div className="space-y-6">
      {/* KPI Cards Row 1: High Level Enterprise Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ReportKPICard
          title="Partner Schools"
          value={kpi.totalSchools}
          subtitle="Registered institutions"
          icon={Building2}
          iconColor="text-blue-600"
        />
        <ReportKPICard
          title="Enrolled Students"
          value={kpi.totalStudents}
          subtitle="Total across all schools"
          icon={Users}
          iconColor="text-indigo-600"
        />
        <ReportKPICard
          title="Total Orders"
          value={kpi.totalOrders}
          subtitle="Lifetime order submissions"
          icon={ShoppingCart}
          iconColor="text-emerald-600"
        />
        <ReportKPICard
          title="Total Ordered Items"
          value={kpi.totalOrderedItems}
          subtitle="Historical snapshot quantity"
          icon={Layers}
          iconColor="text-amber-600"
        />
      </div>

      {/* KPI Cards Row 2: Active Pipeline Stage Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ReportKPICard
          title="In Production"
          value={kpi.ordersInProduction}
          subtitle="Manufacturing active"
          icon={Factory}
          iconColor="text-indigo-600"
        />
        <ReportKPICard
          title="In Quality Check"
          value={kpi.ordersInQC}
          subtitle="Inspection active"
          icon={ClipboardCheck}
          iconColor="text-purple-600"
        />
        <ReportKPICard
          title="Packed Orders"
          value={kpi.ordersPacked}
          subtitle="Ready for courier dispatch"
          icon={Package}
          iconColor="text-teal-600"
        />
        <ReportKPICard
          title="Delivered Orders"
          value={kpi.ordersDelivered}
          subtitle="Fulfilled and confirmed"
          icon={Truck}
          iconColor="text-emerald-600"
        />
      </div>

      {/* Grid: Order Status Distribution + Quality & Delivery Summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Distribution Chart */}
        <Card className="border-slate-200 lg:col-span-2 shadow-sm">
          <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Order Lifecycle Stage Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time count of all orders categorized by their current lifecycle state.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <DistributionBarChart data={distribution} />
          </CardContent>
        </Card>

        {/* Right 1 Col: Quality & Delivery Summaries */}
        <div className="space-y-6">
          {/* Quality Summary */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4 text-purple-600" />
                Quality Inspection Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Items Inspected</span>
                <span className="font-semibold text-slate-900">{quality.totalChecked}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Passed Inspection</span>
                <span className="font-medium text-emerald-700">{quality.totalPassed}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Defective Items</span>
                <span className="font-medium text-rose-700">{quality.totalDefective}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Defect Rate</span>
                <span className="font-bold text-slate-900">{quality.defectRate}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Summary */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-emerald-600" />
                Fulfillment & Delivery Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Total Dispatched</span>
                <span className="font-semibold text-slate-900">{delivery.totalDispatched}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">In Transit</span>
                <span className="font-medium text-sky-700">{delivery.inTransit}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Confirmed Delivered</span>
                <span className="font-medium text-emerald-700">{delivery.delivered}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Delivery Completion Rate</span>
                <span className="font-bold text-emerald-700">{delivery.completionRate}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* School Comparison Table (Factual only, no evaluative ranking) */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            School Operational Comparison
          </CardTitle>
          <CardDescription className="text-xs">
            Factual operational metrics across all registered partner schools.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Code</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Students</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Orders</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Items Ordered</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">Latest Stage</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Delivered</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schoolComparison.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-500">
                    No school operational data found for the selected criteria.
                  </TableCell>
                </TableRow>
              ) : (
                schoolComparison.map((s) => (
                  <TableRow key={s.schoolId} className="hover:bg-slate-50/80">
                    <TableCell className="font-medium text-slate-900 text-xs">{s.schoolName}</TableCell>
                    <TableCell className="text-slate-600 text-xs font-mono">{s.schoolCode}</TableCell>
                    <TableCell className="text-center text-slate-800 text-xs font-medium">{s.totalStudents}</TableCell>
                    <TableCell className="text-center text-slate-800 text-xs font-medium">{s.orderCount}</TableCell>
                    <TableCell className="text-center text-slate-800 text-xs font-medium">{s.totalItems}</TableCell>
                    <TableCell className="text-slate-700 text-xs">{s.currentOrderStage}</TableCell>
                    <TableCell className="text-center text-emerald-700 text-xs font-medium">{s.deliveredOrders}</TableCell>
                    <TableCell className="text-center text-amber-700 text-xs font-medium">{s.pendingOrders}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
