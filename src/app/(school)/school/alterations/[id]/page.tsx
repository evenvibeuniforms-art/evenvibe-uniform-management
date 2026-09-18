import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Package, Scissors, Clock, Download } from "lucide-react";
import Link from "next/link";

interface HistoryItem {
  id?: string;
  status: string;
  note?: string | null;
  created_at: string;
}

export const metadata: Metadata = {
  title: "Alteration Details | EvenVibe School Admin",
  description: "View alteration request details and timeline.",
};

export default async function AlterationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: alteration, error } = await supabase
    .from("alteration_requests")
    .select(`
      id, request_number, status, item_name, item_type, issue_type, quantity,
      current_size, required_size, remarks, description, proof_photo_url, created_at,
      rejection_reason, rework_remarks, completed_remarks,
      students (id, student_name, class_name, section, admission_number, gender),
      orders (id, order_number, status, created_at, delivered_at),
      alteration_request_history (id, status, note, created_at)
    `)
    .eq("id", id)
    .eq("school_id", profile.school_id)
    .single();

  if (error || !alteration) {
    notFound();
  }

  const student = Array.isArray(alteration.students) ? alteration.students[0] : alteration.students;
  const order = Array.isArray(alteration.orders) ? alteration.orders[0] : alteration.orders;

  let signedPhotoUrl: string | null = null;
  if (alteration.proof_photo_url) {
    const { data: storageData } = await supabase.storage
      .from("alteration-proofs")
      .createSignedUrl(alteration.proof_photo_url, 3600);
    signedPhotoUrl = storageData?.signedUrl || null;
  }

  const history = (alteration.alteration_request_history || []).sort(
    (a: { created_at: string }, b: { created_at: string }) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge className="bg-blue-100 text-blue-800 uppercase">Requested</Badge>;
      case "under_review":
        return <Badge className="bg-amber-100 text-amber-800 uppercase">Under Review</Badge>;
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 uppercase">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 uppercase">Rejected</Badge>;
      case "rework":
        return <Badge className="bg-purple-100 text-purple-800 uppercase">Rework</Badge>;
      case "completed":
        return <Badge className="bg-slate-100 text-slate-800 uppercase">Completed</Badge>;
      default:
        return <Badge variant="outline" className="uppercase">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr));
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
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
          <p className="text-slate-500 mt-1 text-sm">
            Submitted on {formatDate(alteration.created_at)}
          </p>
        </div>
      </div>

      {alteration.status === "rejected" && alteration.rejection_reason && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-xs font-semibold uppercase text-red-800 tracking-wider block mb-1">
            Rejection Reason (EvenVive Admin)
          </span>
          <p className="text-sm text-red-900 font-medium">{alteration.rejection_reason}</p>
        </div>
      )}

      {alteration.rework_remarks && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <span className="text-xs font-semibold uppercase text-purple-800 tracking-wider block mb-1">
            Rework Instructions / Remarks
          </span>
          <p className="text-sm text-purple-900">{alteration.rework_remarks}</p>
        </div>
      )}

      {alteration.completed_remarks && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <span className="text-xs font-semibold uppercase text-emerald-800 tracking-wider block mb-1">
            Completion Remarks
          </span>
          <p className="text-sm text-emerald-900">{alteration.completed_remarks}</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Issue & Uniform Card */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Scissors className="h-4 w-4 text-emerald-600" />
                Uniform Item & Issue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 bg-slate-50 rounded-lg border text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Item</span>
                  <span className="font-semibold text-slate-900 capitalize">
                    {alteration.item_name || alteration.item_type}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Quantity</span>
                  <span className="font-semibold text-slate-900">{alteration.quantity}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Current Size</span>
                  <span className="font-medium text-slate-700">{alteration.current_size || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Required Size</span>
                  <span className="font-bold text-emerald-700">{alteration.required_size || "-"}</span>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-500 block">Reason for Request</span>
                <span className="font-semibold text-slate-900 text-sm">{alteration.issue_type}</span>
              </div>

              {(alteration.remarks || alteration.description) && (
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Additional Remarks</span>
                  <div className="p-3 bg-white border rounded text-sm text-slate-700 whitespace-pre-wrap">
                    {alteration.remarks || alteration.description}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Student Context Card */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                Student Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">Name</span>
                <span className="font-semibold text-slate-800">{student?.student_name || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Adm No</span>
                <span className="font-medium text-slate-700">{student?.admission_number || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Class</span>
                <span className="font-medium text-slate-700">{student?.class_name || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Section</span>
                <span className="font-medium text-slate-700">{student?.section || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Gender</span>
                <span className="font-medium text-slate-700">{student?.gender || "-"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Order Card */}
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-400" />
                Related Delivered Order
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">Order Number</span>
                <span className="font-semibold text-slate-800">{order?.order_number || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Order Date</span>
                <span className="font-medium text-slate-700">{formatShortDate(order?.created_at)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Delivered Date</span>
                <span className="font-medium text-slate-700">{formatShortDate(order?.delivered_at)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Photo Proof */}
          {signedPhotoUrl && (
            <Card>
              <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-base">Uploaded Proof Image</CardTitle>
                <a
                  href={signedPhotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  View Full Image
                </a>
              </CardHeader>
              <CardContent className="pt-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedPhotoUrl}
                  alt="Alteration Proof"
                  className="max-h-72 rounded-lg border object-contain bg-slate-50 p-1"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Timeline / History */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Workflow History
              </CardTitle>
              <CardDescription>Status is managed by EvenVive Admin</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {history.length === 0 ? (
                <p className="text-xs text-slate-500">No history available.</p>
              ) : (
                history.map((h: HistoryItem, idx: number) => (
                  <div key={h.id || idx} className="flex items-start gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 uppercase text-xs">
                          {h.status.replace("_", " ")}
                        </span>
                        <span className="text-xs text-slate-400">{formatDate(h.created_at)}</span>
                      </div>
                      {h.note && <p className="text-xs text-slate-600 mt-0.5">{h.note}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
