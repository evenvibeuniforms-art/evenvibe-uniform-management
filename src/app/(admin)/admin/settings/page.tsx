import { requireAdmin } from "@/lib/auth/server";
import { getAdminSettings } from "./actions";
import { AdminSettingsView } from "./views/AdminSettingsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings & Configuration | EvenVibe Admin",
  description: "Manage EvenVive system preferences, company information, and operational configuration.",
};

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settingsData = await getAdminSettings();

  return <AdminSettingsView initialData={settingsData} />;
}
