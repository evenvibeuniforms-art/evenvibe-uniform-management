import { requireAdmin } from "@/lib/auth/server";
import {
  getSchoolOptions,
  getDashboardKPISummary,
  getSchoolPerformanceReport,
  getStudentReport,
  getUniformSizeReport,
  getOrderReport,
  getProductionReport,
  getQualityCheckReport,
  getPackingReport,
  getDeliveryReport,
} from "./actions";
import AdminReportsView from "./views/AdminReportsView";
import { GlobalReportFilters } from "./types";

export const metadata = {
  title: "Reports & Analytics | EvenVibe Admin",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const dateFilter = (typeof params.date === "string" ? params.date : "all") as GlobalReportFilters["dateFilter"];
  const customStart = typeof params.start === "string" ? params.start : undefined;
  const customEnd = typeof params.end === "string" ? params.end : undefined;
  const schoolId = typeof params.school === "string" && params.school !== "all" ? params.school : undefined;
  const searchQuery = typeof params.q === "string" ? params.q.trim() : undefined;

  const initialFilters: GlobalReportFilters = {
    dateFilter,
    customStartDate: customStart,
    customEndDate: customEnd,
    schoolId,
    searchQuery,
  };

  const initialPagination = { page: 1, pageSize: 10 };

  const [
    schools,
    overview,
    schoolReport,
    studentReport,
    uniformSizeReport,
    orderReport,
    productionReport,
    qualityCheckReport,
    packingReport,
    deliveryReport,
  ] = await Promise.all([
    getSchoolOptions(),
    getDashboardKPISummary(initialFilters),
    getSchoolPerformanceReport(initialFilters, initialPagination),
    getStudentReport(initialFilters, initialPagination),
    getUniformSizeReport(initialFilters, initialPagination),
    getOrderReport(initialFilters, initialPagination),
    getProductionReport(initialFilters, initialPagination),
    getQualityCheckReport(initialFilters, initialPagination),
    getPackingReport(initialFilters, initialPagination),
    getDeliveryReport(initialFilters, initialPagination),
  ]);

  return (
    <AdminReportsView
      schools={schools}
      initialOverview={overview}
      initialSchoolReport={schoolReport}
      initialStudentReport={studentReport}
      initialUniformSizeReport={uniformSizeReport}
      initialOrderReport={orderReport}
      initialProductionReport={productionReport}
      initialQualityCheckReport={qualityCheckReport}
      initialPackingReport={packingReport}
      initialDeliveryReport={deliveryReport}
    />
  );
}
