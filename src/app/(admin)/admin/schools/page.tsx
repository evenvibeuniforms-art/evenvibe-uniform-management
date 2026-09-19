import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SchoolsTable } from "@/components/admin/schools/SchoolsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { School, Activity, Clock, ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Manage Schools | EvenVibe Admin",
};

export default async function AdminSchoolsPage() {
  await requireAdmin();
  const supabase = await createClient();

  // Fetch all schools and school_admin profiles in parallel
  const [
    { data: schools, error: schoolsError },
    { data: profiles, error: profilesError }
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active, school_id")
      .eq("role", "school_admin"),
  ]);

  if (schoolsError) {
    console.error("Failed to fetch schools:", schoolsError);
  }
  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError);
  }

  // Combine data
  const schoolsData = (schools || []).map(school => {
    // Find the primary admin profile for this school
    const adminProfile = profiles?.find(p => p.school_id === school.id);
    return {
      ...school,
      adminProfile: adminProfile || null,
    };
  });

  const totalCount = schoolsData.length;
  const activeCount = schoolsData.filter(s => s.is_active).length;
  const pendingCount = totalCount - activeCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Schools</h1>
        <p className="text-slate-500 mt-2">
          Manage school registrations, approvals, and accounts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
            <School className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive/Rejected</CardTitle>
            <ShieldAlert className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {/* For now, pending and rejected share the same is_active=false status */}
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-slate-500">Tracked as pending</p>
          </CardContent>
        </Card>
      </div>

      <SchoolsTable schools={schoolsData} />
    </div>
  );
}
