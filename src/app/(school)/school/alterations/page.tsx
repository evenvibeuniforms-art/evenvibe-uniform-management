import { Metadata } from "next";
import { getAlterationsSummary } from "./actions";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scissors, Clock, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { AlterationForm } from "./AlterationForm";

export const metadata: Metadata = {
  title: "Alterations & Rework | EvenVibe School Admin",
  description: "Manage uniform alteration and rework requests.",
};

export default async function AlterationsPage() {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { summary } = await getAlterationsSummary();

  // Fetch alterations list
  const { data: alterations } = await supabase
    .from("alteration_requests")
    .select(`
      id, request_number, status, created_at, uniform_type, item_type, issue_type,
      students (id, full_name, class_name, section, roll_number)
    `)
    .eq("school_id", profile.school_id)
    .order("created_at", { ascending: false });

  // Fetch delivered orders for the school
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("school_id", profile.school_id)
    .eq("status", "delivered")
    .order("created_at", { ascending: false });

  const deliveredOrders = (orders || []).map(o => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
  }));

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'requested': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 uppercase">Requested</Badge>;
      case 'under_review': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 uppercase">Under Review</Badge>;
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 uppercase">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 uppercase">Rejected</Badge>;
      case 'rework': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 uppercase">Rework</Badge>;
      case 'completed': return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-200 uppercase">Completed</Badge>;
      default: return <Badge variant="outline" className="uppercase">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Alterations & Rework</h1>
          <p className="text-slate-500 mt-1">Manage and track uniform issue requests.</p>
        </div>
        <AlterationForm deliveredOrders={deliveredOrders} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total</CardTitle>
            <Scissors className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.total || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Requested</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.requested || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Under Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.under_review || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Rework</CardTitle>
            <RotateCcw className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.rework || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary?.completed || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!alterations || alterations.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Scissors className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No requests yet</h3>
              <p className="text-slate-500 text-sm max-w-sm">When a uniform issue needs correction, create a request here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y">
                  <tr>
                    <th className="px-4 py-3 font-medium">Request No</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Class / Roll</th>
                    <th className="px-4 py-3 font-medium">Uniform & Item</th>
                    <th className="px-4 py-3 font-medium">Issue</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alterations.map((alt) => {
                    const student = Array.isArray(alt.students) ? alt.students[0] : alt.students;
                    return (
                      <tr key={alt.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{alt.request_number}</td>
                        <td className="px-4 py-3">{student?.full_name || "Unnamed"}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {student?.class_name}-{student?.section} <br/> 
                          <span className="text-xs">Roll: {student?.roll_number}</span>
                        </td>
                        <td className="px-4 py-3 capitalize">
                          <div className="font-medium">{alt.uniform_type}</div>
                          <div className="text-xs text-slate-500">{alt.item_type}</div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-500">{alt.issue_type.replace('_', ' ')}</td>
                        <td className="px-4 py-3">{renderStatusBadge(alt.status)}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(alt.created_at))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link 
                            href={`/school/alterations/${alt.id}`}
                            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                          >
                            View &rarr;
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
