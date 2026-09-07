import { Metadata } from "next";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { getProfileAndSchool } from "./actions";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = {
  title: "Settings | EvenVibe School Admin",
  description: "Manage your profile, school information, and account security.",
};

export default async function SettingsPage() {
  await requireSchoolAdmin();

  const result = await getProfileAndSchool();

  if (!result.success || !result.profile || !result.school) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load settings: {result.error}
      </div>
    );
  }

  return <SettingsView profile={result.profile} school={result.school} />;
}
