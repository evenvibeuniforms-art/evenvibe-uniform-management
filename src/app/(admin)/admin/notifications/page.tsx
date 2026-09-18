import { requireAdmin } from "@/lib/auth/server";
import { getNotificationsList, getSchoolOptions } from "./actions";
import { AdminNotificationsView } from "./views/AdminNotificationsView";
import { NotificationFilters as FiltersType } from "./types";

export const metadata = {
  title: "Notifications Management | EvenVibe Admin",
  description: "Create, schedule, and broadcast announcements and operational notifications to schools.",
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search.trim() : "";
  const status = (typeof params.status === "string" ? params.status : "all") as FiltersType["status"];
  const type = (typeof params.type === "string" ? params.type : "all") as FiltersType["type"];
  const targetType = (typeof params.audience === "string" ? params.audience : "all") as FiltersType["targetType"];
  const datePreset = (typeof params.date === "string" ? params.date : "all") as FiltersType["datePreset"];
  const customStartDate = typeof params.start === "string" ? params.start : undefined;
  const customEndDate = typeof params.end === "string" ? params.end : undefined;

  const page = typeof params.page === "string" && parseInt(params.page, 10) > 0 ? parseInt(params.page, 10) : 1;
  const pageSize = typeof params.pageSize === "string" && parseInt(params.pageSize, 10) > 0 ? parseInt(params.pageSize, 10) : 10;
  const sortBy = (typeof params.sortBy === "string" ? params.sortBy : "created_at") as FiltersType["sortBy"];
  const sortAsc = params.sortAsc === "true";

  const filters: FiltersType = {
    search,
    status,
    type,
    targetType,
    datePreset,
    customStartDate,
    customEndDate,
    page,
    pageSize,
    sortBy,
    sortAsc,
  };

  const [schools, initialData] = await Promise.all([
    getSchoolOptions(),
    getNotificationsList(filters),
  ]);

  return (
    <AdminNotificationsView
      initialData={initialData}
      schools={schools}
      filters={filters}
    />
  );
}
