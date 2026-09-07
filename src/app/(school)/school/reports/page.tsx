import { Metadata } from "next";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { 
  getOverviewReport, 
  getClassSectionReport, 
  getUniformSizeReport, 
  getPendingSizesReport, 
  getRequirementsReport, 
  getOrdersReport, 
  getAlterationsReport, 
  getReportFilterOptions 
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
    overview,
    classSection,
    sizeSummary,
    pendingSizes,
    requirements,
    orders,
    alterations
  ] = await Promise.all([
    getReportFilterOptions(),
    getOverviewReport(),
    getClassSectionReport(),
    getUniformSizeReport(),
    getPendingSizesReport(),
    getRequirementsReport(),
    getOrdersReport(),
    getAlterationsReport(),
  ]);

  return (
    <ReportsView
      filterOptions={filterOptions}
      initialOverview={overview}
      initialClassSection={classSection}
      initialSizeSummary={sizeSummary}
      initialPendingSizes={pendingSizes}
      initialRequirements={requirements}
      initialOrders={orders}
      initialAlterations={alterations}
    />
  );
}
