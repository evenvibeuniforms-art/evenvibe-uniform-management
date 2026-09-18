import { requireAdmin } from "@/lib/auth/server";
import { getAdminDashboardData } from "./actions";
import AdminDashboardView from "./components/AdminDashboardView";
import { AlertCircle } from "lucide-react";
import { AdminDashboardData } from "./types";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const profile = await requireAdmin();

  let dashboardData: AdminDashboardData | null = null;
  let loadError = false;

  try {
    dashboardData = await getAdminDashboardData();
  } catch (error) {
    console.error("[AdminDashboardPage] Error loading dashboard:", error);
    loadError = true;
  }

  if (loadError || !dashboardData) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">
          Dashboard Unavailable
        </h2>
        <p className="text-sm text-slate-600">
          Unable to load dashboard data. Please try again.
        </p>
      </div>
    );
  }

  return (
    <AdminDashboardView
      data={dashboardData}
      userRole={profile.role || "admin"}
    />
  );
}
