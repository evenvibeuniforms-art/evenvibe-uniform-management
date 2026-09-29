import { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUniformStyles, getSchoolConfiguredItems } from "./actions";
import UniformDesignsClient, { SelectedSchool } from "./UniformDesignsClient";
import UniformDesignsSchoolList, { SchoolWithStyleCount } from "./UniformDesignsSchoolList";

export const metadata: Metadata = {
  title: "Uniform Designs Master - EvenVibe Admin",
  description: "Manage uniform styles, class mappings, and design specs",
};

export default async function AdminUniformDesignsPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  await requireAdmin();
  const { schoolId } = await searchParams;
  const supabase = await createClient();

  // Fetch all schools
  const { data: schoolsData } = await supabase
    .from("schools")
    .select("id, name, school_code, city, state, is_active")
    .order("name");

  const schools: SelectedSchool[] = (schoolsData || []).map((s) => ({
    id: s.id,
    name: s.name,
    school_code: s.school_code,
    city: s.city,
    state: s.state,
    is_active: s.is_active,
  }));

  const selectedSchool = schoolId ? schools.find((s) => s.id === schoolId) : null;

  // 1. School Selected View: Render uniform designs management strictly for this school
  if (selectedSchool) {
    const [{ styles }, configuredItems] = await Promise.all([
      getAdminUniformStyles({ schoolId: selectedSchool.id }),
      getSchoolConfiguredItems(selectedSchool.id),
    ]);

    return (
      <UniformDesignsClient
        selectedSchool={selectedSchool}
        initialStyles={styles}
        initialConfiguredItems={configuredItems}
      />
    );
  }

  // 2. Initial View (/admin/uniform-designs): Render clean School List Page
  // Fetch style counts per school to display on cards
  const { data: styleCounts } = await supabase
    .from("uniform_styles")
    .select("school_id");

  const countMap: Record<string, number> = {};
  (styleCounts || []).forEach((item) => {
    countMap[item.school_id] = (countMap[item.school_id] || 0) + 1;
  });

  const schoolsWithCounts: SchoolWithStyleCount[] = schools.map((s) => ({
    id: s.id,
    name: s.name,
    school_code: s.school_code || "",
    city: s.city || null,
    state: s.state || null,
    is_active: s.is_active ?? true,
    stylesCount: countMap[s.id] || 0,
  }));

  return <UniformDesignsSchoolList schools={schoolsWithCounts} />;
}
