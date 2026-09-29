import { requireAdmin } from "@/lib/auth/server";
import { getAcademicSizeHistoryData } from "./actions";
import { AcademicSizeHistoryView } from "./views/AcademicSizeHistoryView";
import { HistoryFilters } from "./types";

export const metadata = {
  title: "Academic Size History | EvenVibe Admin",
};

export default async function AcademicSizeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  // Strictly enforce server-side Admin authorization
  await requireAdmin();

  const params = await searchParams;

  const initialFilters: HistoryFilters = {
    school_id: params.school_id || "all",
    academic_year: params.academic_year || "all",
    class_name: params.class_name || "all",
    section: params.section || "all",
    gender: params.gender || "all",
    search: params.search || "",
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 20,
  };

  const initialData = await getAcademicSizeHistoryData(initialFilters);

  return (
    <AcademicSizeHistoryView
      initialData={initialData}
      initialFilters={initialFilters}
    />
  );
}
