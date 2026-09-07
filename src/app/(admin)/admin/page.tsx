import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { School, Users, Activity, Clock } from "lucide-react";
import Link from "next/link";


export default async function AdminPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  // Fetch quick overview stats
  const { count: pendingSchoolsCount } = await supabase
    .from("schools")
    .select("*", { count: 'exact', head: true })
    .eq("is_active", false);

  const { count: activeSchoolsCount } = await supabase
    .from("schools")
    .select("*", { count: 'exact', head: true })
    .eq("is_active", true);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-2">
          Welcome back. You are logged in as <span className="font-medium text-slate-700">{profile.role}</span>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Schools</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSchoolsCount ?? 0}</div>
            <p className="text-xs text-slate-500">Awaiting approval</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSchoolsCount ?? 0}</div>
            <p className="text-xs text-slate-500">Registered and approved</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-slate-500">Across all schools</p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <span className="text-slate-500 font-bold">₹</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-slate-500">This month</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex gap-4">
        <Link href="/admin/schools" className="inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 h-9 px-4 py-2 text-sm font-medium transition-colors">
          <School className="mr-2 h-4 w-4" />
          Manage Schools
        </Link>
      </div>
    </div>
  );
}
