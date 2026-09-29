import { Metadata } from "next";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { getSchoolUniformStyles } from "./actions";
import SchoolUniformDesignsView from "./SchoolUniformDesignsView";

export const metadata: Metadata = {
  title: "Uniform Designs - EvenVibe School",
  description: "View available uniform designs and styles for your school",
};

export default async function SchoolUniformDesignsPage() {
  await requireSchoolAdmin();
  const { styles, schoolName } = await getSchoolUniformStyles();

  return (
    <div className="space-y-6">
      <SchoolUniformDesignsView initialStyles={styles} schoolName={schoolName} />
    </div>
  );
}
