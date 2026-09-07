import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, User, Package, AlertCircle } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Alteration Details | EvenVibe School Admin",
  description: "View alteration request details and timeline.",
};

export default async function AlterationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: alteration, error } = await supabase
    .from("alteration_requests")
    .select(`
      *,
      students (id, full_name, class_name, section, roll_number),
      orders (id, order_number, status),
      alteration_request_history (*)
    `)
    .eq("id", id)
    .eq("school_id", profile.school_id)
    .single();

  if (error || !alteration) {
    notFound();
  }

  const student = Array.isArray(alteration.students) ? alteration.students[0] : alteration.students;
  const order = Array.isArray(alteration.orders) ? alteration.orders[0] : alteration.orders;
  
  const history = (alteration.alteration_request_history || []).sort(
    (a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const TIMELINE_STAGES = [
    { id: 'requested', label: 'Requested' },
    { id: 'under_review', label: 'Under Review' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'rework', label: 'Rework in Progress' },
    { id: 'completed', label: 'Completed' }
  ];

  const getHistoryDate = (statusId: string) => {
    const historyItem = history.find((h: { status: string; created_at: string; note: string | null }) => h.status === statusId);
    if (!historyItem) return null;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(historyItem.created_at));
  };

  const getHistoryNote = (statusId: string) => {
    const historyItem = history.find((h: { status: string; created_at: string; note: string | null }) => h.status === statusId);
    return historyItem?.note || null;
  };

  const isRejected = history.some((h: { status: string; created_at: string; note: string | null }) => h.status === "rejected");

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'requested': return <Badge className="bg-blue-100 text-blue-800 uppercase">Requested</Badge>;
      case 'under_review': return <Badge className="bg-amber-100 text-amber-800 uppercase">Under Review</Badge>;
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-800 uppercase">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800 uppercase">Rejected</Badge>;
      case 'rework': return <Badge className="bg-purple-100 text-purple-800 uppercase">Rework</Badge>;
      case 'completed': return <Badge className="bg-slate-100 text-slate-800 uppercase">Completed</Badge>;
      default: return <Badge variant="outline" className="uppercase">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/school/alterations">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            {alteration.request_number}
            {renderStatusBadge(alteration.status)}
          </h1>
          <p className="text-slate-500 mt-1">Submitted on {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(alteration.created_at))}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border">
                <div>
                  <div className="text-sm text-slate-500 font-medium mb-1">Uniform Type</div>
                  <div className="font-semibold text-slate-900 capitalize">{alteration.uniform_type}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 font-medium mb-1">Item Affected</div>
                  <div className="font-semibold text-slate-900 capitalize">{alteration.item_type}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-500 font-medium mb-1">Issue Type</div>
                  <div className="font-semibold text-slate-900 capitalize">{alteration.issue_type.replace('_', ' ')}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Description provided</h3>
                <div className="p-4 bg-white border rounded-md text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {alteration.description}
                </div>
              </div>
              
              {alteration.admin_note && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Admin Note (EvenVibe)</h3>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-amber-900 whitespace-pre-wrap text-sm leading-relaxed">
                    {alteration.admin_note}
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Student & Order Context */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3 border-b mb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  Student Context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <div>
                  <div className="text-xs text-slate-500">Name</div>
                  <div className="font-medium">{student?.full_name || "Unnamed"}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-slate-500">Class</div>
                    <div className="font-medium">{student?.class_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Sec</div>
                    <div className="font-medium">{student?.section}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Roll</div>
                    <div className="font-medium">{student?.roll_number}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b mb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-400" />
                  Related Order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {order ? (
                  <>
                    <div>
                      <div className="text-xs text-slate-500">Order Number</div>
                      <Link href={`/school/orders/${order.id}`} className="font-medium text-emerald-600 hover:underline block mt-0.5">
                        {order.order_number}
                      </Link>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Current Order Status</div>
                      <div className="font-medium capitalize">{order.status.replace('_', ' ')}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 text-sm py-2">
                    No specific order linked to this request.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Timeline */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Request Timeline</CardTitle>
              <CardDescription>Status is managed by EVENVIBE.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:w-0.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:bg-slate-200">
                {TIMELINE_STAGES.map((stage) => {
                  
                  // Skip displaying Rejected if it completed successfully and wasn't rejected
                  if (stage.id === 'rejected' && !isRejected) return null;
                  
                  // Skip displaying Approved/Rework/Completed if it was rejected
                  if (isRejected && (stage.id === 'approved' || stage.id === 'rework' || stage.id === 'completed')) return null;

                  const date = getHistoryDate(stage.id);
                  const isCurrent = alteration.status === stage.id;
                  const isPast = !!date;
                  const note = getHistoryDate(stage.id) ? getHistoryNote(stage.id) : null;
                  
                  return (
                    <div key={stage.id} className="relative z-10 flex items-start gap-4">
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white ${
                        isCurrent ? "border-emerald-500 ring-4 ring-emerald-50" :
                        isPast ? "border-emerald-500" : "border-slate-300"
                      }`}>
                        {isPast ? (
                          stage.id === 'rejected' ? <AlertCircle className="h-3 w-3 text-red-500" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${isCurrent ? "bg-emerald-500" : "bg-transparent"}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`text-sm font-medium ${isPast || isCurrent ? "text-slate-900" : "text-slate-400"}`}>
                          {stage.label}
                        </h4>
                        {date && <p className="text-xs text-slate-500 mt-1">{date}</p>}
                        {note && <p className="text-xs text-slate-600 bg-slate-50 p-2 mt-2 rounded border border-slate-100">{note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
