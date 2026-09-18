import { requireAdmin } from "@/lib/auth/server";
import { getUsersList, getSchoolOptions } from "./actions";
import { AdminUsersView } from "./views/AdminUsersView";
import { UserFilters as FiltersType } from "./types";

export const metadata = {
  title: "User Management | EvenVibe Admin",
  description: "Manage School Admin accounts, access states, and profiles.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const currentAdmin = await requireAdmin();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search.trim() : "";
  const role = (typeof params.role === "string" ? params.role : "all") as FiltersType["role"];
  const schoolId = typeof params.school === "string" ? params.school : "all";
  const status = (typeof params.status === "string" ? params.status : "all") as FiltersType["status"];
  const page = typeof params.page === "string" && parseInt(params.page, 10) > 0 ? parseInt(params.page, 10) : 1;
  const pageSize = typeof params.pageSize === "string" && parseInt(params.pageSize, 10) > 0 ? parseInt(params.pageSize, 10) : 10;
  const sortBy = (typeof params.sortBy === "string" ? params.sortBy : "created_at") as FiltersType["sortBy"];
  const sortAsc = params.sortAsc === "true";

  const filters: FiltersType = {
    search,
    role,
    schoolId,
    status,
    page,
    pageSize,
    sortBy,
    sortAsc,
  };

  const [schools, initialData] = await Promise.all([
    getSchoolOptions(),
    getUsersList(filters),
  ]);

  return (
    <AdminUsersView
      initialData={initialData}
      schools={schools}
      filters={filters}
      currentUserId={currentAdmin.id}
    />
  );
}
