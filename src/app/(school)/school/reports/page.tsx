import { Metadata } from "next";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { 
  getRequirementsReport, 
  getOrdersReport, 
  getAlterationsReport, 
  getReportFilterOptions,
  getAggregatedStudentData
} from "./actions";
import { ReportsView } from "./ReportsView";

export const metadata: Metadata = {
  title: "Reports | EvenVibe School Admin",
  description: "View comprehensive reports on students, size collection, requirements, orders, and alterations.",
};

export default async function ReportsPage() {
  await requireSchoolAdmin();

  // Run all report queries concurrently on the server
  const [
    filterOptions,
    aggregated,
    requirements,
    orders,
    alterations
  ] = await Promise.all([
    getReportFilterOptions(),
    getAggregatedStudentData(),
    getRequirementsReport(),
    getOrdersReport(),
    getAlterationsReport()
  ]);

  return (
    <ReportsView
      filterOptions={filterOptions}
      initialOverview={aggregated.overview}
      initialSizeSummary={aggregated.sizeSummary}
      initialPendingSizes={aggregated.pendingSizes}
      initialRequirements={requirements}
      initialOrders={orders}
      initialAlterations={alterations}
      initialStudents={aggregated.students}
    />
  );
}