"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Scissors,
  Package,
  User,
  Clock,
  Download,
  Loader2,
} from "lucide-react";
import { getSchoolAlterationDetails } from "./actions";

interface HistoryItem {
  id?: string;
  status: string;
  note?: string | null;
  created_at: string;
}

interface AlterationDetailData {
  id: string;
  request_number: string;
  status: string;
  item_name: string;
  issue_type: string;
  quantity: number;
  current_size: string | null;
  required_size: string | null;
  remarks: string | null;
  proof_photo_url: string | null;
  signedPhotoUrl: string | null;
  created_at: string;
  rejection_reason: string | null;
  rework_remarks: string | null;
  completed_remarks: string | null;
  order: {
    id: string;
    order_number: string;
    created_at: string;
    delivered_at: string | null;
  } | null;
  student: {
    id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section: string;
    gender: string;
  } | null;
  history: HistoryItem[];
}

interface AlterationDetailsDialogProps {
  alterationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlterationDetailsDialog({
  alterationId,
  open,
  onOpenChange,
}: AlterationDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AlterationDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    if (open && alterationId) {
      Promise.resolve().then(() => {
        if (!ignore) {
          setLoading(true);
          setError(null);
        }
        return getSchoolAlterationDetails(alterationId);
      }).then((res) => {
        if (!ignore) {
          setLoading(false);
          if (res.success && res.alteration) {
            setData(res.alteration as unknown as AlterationDetailData);
          } else {
            setError(res.error || "Unable to load alteration details.");
          }
        }
      });
    } else {
      Promise.resolve().then(() => {
        if (!ignore) {
          setData(null);
          setError(null);
          setLoading(false);
        }
      });
    }

    return () => {
      ignore = true;
    };
  }, [open, alterationId]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 uppercase">Requested</Badge>;
      case "under_review":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase">Under Review</Badge>;
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 uppercase">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-200 uppercase">Rejected</Badge>;
      case "rework":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 uppercase">Rework</Badge>;
      case "completed":
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200 uppercase">Completed</Badge>;
      default:
        return <Badge variant="outline" className="uppercase">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr));
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-xl font-bold text-slate-900 border-b pb-3">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-emerald-600" />
              <span>{data?.request_number || "Alteration Request"}</span>
            </div>
            {data && renderStatusBadge(data.status)}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-sm">Loading alteration details...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600 text-sm">{error}</div>
        ) : !data ? null : (
          <div className="space-y-6 pt-1">
            {/* Section 1: Request Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-sm border">
              <div>
                <span className="text-xs text-slate-500 block">Request ID</span>
                <span className="font-semibold text-slate-900">{data.request_number}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Requested Date</span>
                <span className="font-medium text-slate-800">{formatDate(data.created_at)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Current Status</span>
                <div className="mt-0.5">{renderStatusBadge(data.status)}</div>
              </div>
            </div>

            {/* Rejection / Completed / Admin Notes Notice */}
            {data.status === "rejected" && data.rejection_reason && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-xs font-semibold uppercase text-red-800 tracking-wider block mb-1">
                  Rejection Reason (EvenVive Admin)
                </span>
                <p className="text-sm text-red-900 font-medium">{data.rejection_reason}</p>
              </div>
            )}

            {data.rework_remarks && (
              <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-xs font-semibold uppercase text-purple-800 tracking-wider block mb-1">
                  Rework Instructions / Remarks
                </span>
                <p className="text-sm text-purple-900">{data.rework_remarks}</p>
              </div>
            )}

            {data.completed_remarks && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold uppercase text-emerald-800 tracking-wider block mb-1">
                  Completion Remarks
                </span>
                <p className="text-sm text-emerald-900">{data.completed_remarks}</p>
              </div>
            )}

            {/* Section 2: Order Information */}
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-500" />
                Delivered Order
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm pt-1">
                <div>
                  <span className="text-xs text-slate-500 block">Order Number</span>
                  <span className="font-semibold text-slate-800">{data.order?.order_number || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Order Date</span>
                  <span className="font-medium text-slate-700">{formatShortDate(data.order?.created_at || null)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Delivered Date</span>
                  <span className="font-medium text-slate-700">{formatShortDate(data.order?.delivered_at || null)}</span>
                </div>
              </div>
            </div>

            {/* Section 3: Student Information */}
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                Student
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm pt-1">
                <div>
                  <span className="text-xs text-slate-500 block">Student Name</span>
                  <span className="font-semibold text-slate-800">{data.student?.student_name || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Admission Number</span>
                  <span className="font-medium text-slate-700">{data.student?.admission_number || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Class</span>
                  <span className="font-medium text-slate-700">{data.student?.class_name || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Section</span>
                  <span className="font-medium text-slate-700">{data.student?.section || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Gender</span>
                  <span className="font-medium text-slate-700">{data.student?.gender || "-"}</span>
                </div>
              </div>
            </div>

            {/* Section 4: Uniform & Issue Details */}
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scissors className="h-4 w-4 text-slate-500" />
                Uniform Item & Issue
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Uniform Item</span>
                  <span className="font-semibold text-slate-800 capitalize">{data.item_name}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Quantity</span>
                  <span className="font-semibold text-slate-800">{data.quantity}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Current Size</span>
                  <span className="font-medium text-slate-700">{data.current_size || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Required Size</span>
                  <span className="font-bold text-emerald-700">{data.required_size || "-"}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <span className="text-xs text-slate-500 block">Reason for Request</span>
                <span className="font-semibold text-slate-900 text-sm">{data.issue_type}</span>
              </div>

              {data.remarks && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-slate-500 block mb-1">Additional Remarks</span>
                  <p className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded border whitespace-pre-wrap">
                    {data.remarks}
                  </p>
                </div>
              )}
            </div>

            {/* Section 5: Photo Proof */}
            {data.signedPhotoUrl && (
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Uploaded Photo Proof</h3>
                  <a
                    href={data.signedPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Open full size
                  </a>
                </div>
                <div className="pt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.signedPhotoUrl}
                    alt="Alteration Proof"
                    className="max-h-64 rounded-lg border object-contain bg-slate-50 p-1"
                  />
                </div>
              </div>
            )}

            {/* Section 6: Workflow History Timeline */}
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Workflow History
              </h3>
              <div className="space-y-3 pt-1">
                {(!data.history || data.history.length === 0) ? (
                  <p className="text-xs text-slate-500">No status history recorded.</p>
                ) : (
                  data.history.map((h: HistoryItem, idx: number) => (
                    <div key={h.id || idx} className="flex items-start gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 uppercase text-xs">
                            {h.status.replace("_", " ")}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDate(h.created_at)}
                          </span>
                        </div>
                        {h.note && (
                          <p className="text-xs text-slate-600 mt-0.5">{h.note}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
