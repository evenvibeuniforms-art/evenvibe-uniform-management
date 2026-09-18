"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Scissors,
  Package,
  User,
  School,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  XCircle,
  ThumbsUp,
  Play,
  Check,
} from "lucide-react";
import {
  getAdminAlterationDetails,
  updateAdminAlterationStatus,
} from "./actions";

interface HistoryItem {
  id?: string;
  status: string;
  note?: string | null;
  created_at: string;
}

interface AdminAlterationDetailData {
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
  school: {
    id: string;
    name: string;
  } | null;
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

interface AdminAlterationDetailsDialogProps {
  alterationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

export function AdminAlterationDetailsDialog({
  alterationId,
  open,
  onOpenChange,
  onStatusUpdated,
}: AdminAlterationDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminAlterationDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Dialog sub-action states
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const [showReworkForm, setShowReworkForm] = useState(false);
  const [reworkRemarks, setReworkRemarks] = useState("");

  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [completedRemarks, setCompletedRemarks] = useState("");

  const loadDetails = useCallback(() => {
    if (!alterationId) return;
    setLoading(true);
    setError(null);
    getAdminAlterationDetails(alterationId).then((res) => {
      setLoading(false);
      if (res.success && res.alteration) {
        setData(res.alteration as unknown as AdminAlterationDetailData);
      } else {
        setError(res.error || "Unable to load alteration details.");
      }
    });
  }, [alterationId]);

  useEffect(() => {
    let ignore = false;

    if (open && alterationId) {
      Promise.resolve().then(() => {
        if (!ignore) {
          setShowRejectForm(false);
          setRejectionReason("");
          setShowReworkForm(false);
          setReworkRemarks("");
          setShowCompleteForm(false);
          setCompletedRemarks("");
          setActionError(null);
          setActionSuccess(null);
          setLoading(true);
          setError(null);
        }
        return getAdminAlterationDetails(alterationId);
      }).then((res) => {
        if (!ignore) {
          setLoading(false);
          if (res.success && res.alteration) {
            setData(res.alteration as unknown as AdminAlterationDetailData);
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

  const handleAction = (
    newStatus: "under_review" | "approved" | "rejected" | "rework" | "completed",
    options?: { rejectionReason?: string; reworkRemarks?: string; completedRemarks?: string; adminNote?: string }
  ) => {
    if (!alterationId) return;
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await updateAdminAlterationStatus({
        id: alterationId,
        newStatus,
        rejectionReason: options?.rejectionReason,
        reworkRemarks: options?.reworkRemarks,
        completedRemarks: options?.completedRemarks,
        adminNote: options?.adminNote,
      });

      if (res.success) {
        setActionSuccess(res.message || "Status updated successfully.");
        setShowRejectForm(false);
        setShowReworkForm(false);
        setShowCompleteForm(false);
        loadDetails();
        if (onStatusUpdated) onStatusUpdated();
      } else {
        setActionError(res.error || "Unable to update alteration status.");
      }
    });
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 uppercase text-xs font-semibold">Requested</Badge>;
      case "under_review":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase text-xs font-semibold">Under Review</Badge>;
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 uppercase text-xs font-semibold">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-200 uppercase text-xs font-semibold">Rejected</Badge>;
      case "rework":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 uppercase text-xs font-semibold">Rework</Badge>;
      case "completed":
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200 uppercase text-xs font-semibold">Completed</Badge>;
      default:
        return <Badge variant="outline" className="uppercase text-xs">{status}</Badge>;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-xl font-bold text-slate-900 border-b pb-3">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-emerald-600" />
              <span>{data?.request_number || "Alteration Request Review"}</span>
            </div>
            {data && renderStatusBadge(data.status)}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-sm">Loading alteration details...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600 text-sm">{error}</div>
        ) : !data ? null : (
          <div className="space-y-5 pt-1">
            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Action Error</div>
                  <div>{actionError}</div>
                </div>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-sm text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Status Updated</div>
                  <div>{actionSuccess}</div>
                </div>
              </div>
            )}

            {/* School & Request Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 border rounded-lg text-sm">
              <div>
                <span className="text-xs text-slate-500 block">School</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                  <School className="h-3.5 w-3.5 text-slate-400" />
                  {data.school?.name || "-"}
                </span>
              </div>
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

            {/* Status Notices */}
            {data.status === "rejected" && data.rejection_reason && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-xs font-semibold uppercase text-red-800 tracking-wider block mb-1">
                  Rejection Reason
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

            {/* Student & Order Details */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Student */}
              <div className="border rounded-lg p-3.5 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  Student Details
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div>
                    <span className="text-xs text-slate-400 block">Student Name</span>
                    <span className="font-semibold text-slate-800">{data.student?.student_name || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Admission Number</span>
                    <span className="font-medium text-slate-700">{data.student?.admission_number || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Class & Sec</span>
                    <span className="font-medium text-slate-700">
                      {data.student ? `${data.student.class_name}-${data.student.section}` : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Gender</span>
                    <span className="font-medium text-slate-700">{data.student?.gender || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Order */}
              <div className="border rounded-lg p-3.5 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-500" />
                  Delivered Order Details
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div>
                    <span className="text-xs text-slate-400 block">Order Number</span>
                    <span className="font-semibold text-slate-800">{data.order?.order_number || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Delivered Date</span>
                    <span className="font-medium text-slate-700">{formatShortDate(data.order?.delivered_at || null)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-slate-400 block">Order Created</span>
                    <span className="font-medium text-slate-700">{formatShortDate(data.order?.created_at || null)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Uniform Item & Issue */}
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Scissors className="h-4 w-4 text-emerald-600" />
                Uniform Item & Issue Specification
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Uniform Item</span>
                  <span className="font-semibold text-slate-800 capitalize">{data.item_name}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Quantity</span>
                  <span className="font-bold text-slate-900">{data.quantity}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Current Size</span>
                  <span className="font-medium text-slate-700">{data.current_size || "-"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Required Size</span>
                  <span className="font-bold text-emerald-700 text-base">{data.required_size || "-"}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <span className="text-xs text-slate-500 block">Reason for Request</span>
                <span className="font-semibold text-slate-900 text-sm">{data.issue_type}</span>
              </div>

              {data.remarks && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-slate-500 block mb-1">School Admin Remarks</span>
                  <p className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded border whitespace-pre-wrap">
                    {data.remarks}
                  </p>
                </div>
              )}
            </div>

            {/* Proof Photo */}
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
                    className="max-h-72 rounded-lg border object-contain bg-slate-50 p-1"
                  />
                </div>
              </div>
            )}

            {/* History Timeline */}
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Workflow History
              </h3>
              <div className="space-y-2.5 pt-1">
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
                          <span className="text-xs text-slate-400">{formatDate(h.created_at)}</span>
                        </div>
                        {h.note && <p className="text-xs text-slate-600 mt-0.5">{h.note}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Rejection Form Box */}
            {showRejectForm && (
              <div className="p-4 border border-red-200 bg-red-50/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-red-900 flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Reject Alteration Request
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRejectForm(false)}
                    className="h-7 text-xs text-red-700"
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-red-700">
                  A rejection reason is mandatory. This explanation will be saved in history and visible to the School Admin.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="rejectionInput" className="text-xs font-semibold text-red-900">
                    Rejection Reason <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    id="rejectionInput"
                    placeholder="e.g., Required size unavailable in stock, or uniform alteration criteria not met..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={2}
                    className="bg-white border-red-300 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                    disabled={isPending || !rejectionReason.trim()}
                    onClick={() => handleAction("rejected", { rejectionReason })}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Confirm Rejection
                  </Button>
                </div>
              </div>
            )}

            {/* Start Rework Form Box */}
            {showReworkForm && (
              <div className="p-4 border border-purple-200 bg-purple-50/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
                    <Play className="h-4 w-4 text-purple-600" />
                    Move to Rework in Progress
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReworkForm(false)}
                    className="h-7 text-xs text-purple-700"
                  >
                    Cancel
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reworkRemarksInput" className="text-xs font-semibold text-purple-900">
                    Rework Remarks (Optional)
                  </Label>
                  <Textarea
                    id="reworkRemarksInput"
                    placeholder="e.g., Assigned to tailoring floor for alteration; size 34 replacement requested..."
                    value={reworkRemarks}
                    onChange={(e) => setReworkRemarks(e.target.value)}
                    rows={2}
                    className="bg-white border-purple-300 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
                    disabled={isPending}
                    onClick={() => handleAction("rework", { reworkRemarks })}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Confirm Move to Rework
                  </Button>
                </div>
              </div>
            )}

            {/* Complete Form Box */}
            {showCompleteForm && (
              <div className="p-4 border border-emerald-200 bg-emerald-50/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Mark Rework as Completed
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompleteForm(false)}
                    className="h-7 text-xs text-emerald-700"
                  >
                    Cancel
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="completedRemarksInput" className="text-xs font-semibold text-emerald-900">
                    Completion Remarks (Optional)
                  </Label>
                  <Textarea
                    id="completedRemarksInput"
                    placeholder="e.g., Replaced with requested size 34; stitching corrected and delivered..."
                    value={completedRemarks}
                    onChange={(e) => setCompletedRemarks(e.target.value)}
                    rows={2}
                    className="bg-white border-emerald-300 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                    disabled={isPending}
                    onClick={() => handleAction("completed", { completedRemarks })}
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Confirm Completion
                  </Button>
                </div>
              </div>
            )}

            {/* Admin Action Buttons (Section 25) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Close
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                {/* State: Requested -> Under Review or Reject */}
                {data.status === "requested" && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setShowRejectForm(true);
                        setShowReworkForm(false);
                        setShowCompleteForm(false);
                      }}
                      disabled={isPending || showRejectForm}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      size="sm"
                      onClick={() => handleAction("under_review")}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Clock className="h-4 w-4 mr-1.5" />}
                      Move to Under Review
                    </Button>
                  </>
                )}

                {/* State: Under Review -> Approve or Reject */}
                {data.status === "under_review" && (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setShowRejectForm(true);
                        setShowReworkForm(false);
                        setShowCompleteForm(false);
                      }}
                      disabled={isPending || showRejectForm}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="sm"
                      onClick={() => handleAction("approved")}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ThumbsUp className="h-4 w-4 mr-1.5" />}
                      Approve Request
                    </Button>
                  </>
                )}

                {/* State: Approved -> Start Rework */}
                {data.status === "approved" && (
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    size="sm"
                    onClick={() => {
                      setShowReworkForm(true);
                      setShowRejectForm(false);
                      setShowCompleteForm(false);
                    }}
                    disabled={isPending || showReworkForm}
                  >
                    <Play className="h-4 w-4 mr-1.5" />
                    Start Rework
                  </Button>
                )}

                {/* State: Rework -> Mark Completed */}
                {data.status === "rework" && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                    onClick={() => {
                      setShowCompleteForm(true);
                      setShowRejectForm(false);
                      setShowReworkForm(false);
                    }}
                    disabled={isPending || showCompleteForm}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Mark Completed
                  </Button>
                )}

                {/* Terminal states: completed or rejected */}
                {(data.status === "completed" || data.status === "rejected") && (
                  <span className="text-xs text-slate-500 italic">
                    This alteration request is finalized ({data.status}).
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
