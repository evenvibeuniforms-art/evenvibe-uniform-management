"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NotificationRow } from "../types";
import {
  Calendar,
  Clock,
  User,
  Users,
  School,
  CheckCircle2,
  Archive,
  Ban,
  FileEdit,
} from "lucide-react";

interface NotificationDetailsDialogProps {
  notification: NotificationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDetailsDialog({
  notification,
  open,
  onOpenChange,
}: NotificationDetailsDialogProps) {
  if (!notification) return null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "—";
    }
  };

  const getStatusBadge = (status: NotificationRow["status"]) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Published
          </Badge>
        );
      case "scheduled":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            <Clock className="h-3 w-3 mr-1 text-blue-600" /> Scheduled
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
            <FileEdit className="h-3 w-3 mr-1 text-slate-500" /> Draft
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="outline" className="bg-zinc-100 text-zinc-600 border-zinc-300">
            <Archive className="h-3 w-3 mr-1 text-zinc-500" /> Archived
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">
            <Ban className="h-3 w-3 mr-1 text-rose-500" /> Cancelled
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: NotificationRow["notificationType"]) => {
    const labels: Record<string, string> = {
      announcement: "Announcement",
      order: "Order",
      production: "Production",
      quality_check: "Quality Check",
      packing: "Packing",
      delivery: "Delivery",
      system: "System",
    };
    return (
      <Badge variant="secondary" className="capitalize text-xs font-semibold">
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
              Notification Details
            </DialogTitle>
            {getStatusBadge(notification.status)}
          </div>
          <DialogDescription className="text-xs text-slate-500">
            View notification message, targeting, and dispatch history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Header Info */}
          <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              {getTypeBadge(notification.notificationType)}
              <span className="text-xs text-slate-500">
                Created by {notification.createdByName || "Admin"}
              </span>
            </div>

            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {notification.title}
            </h3>

            <div className="rounded-md bg-white border p-3 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {notification.message}
            </div>
          </div>

          <Separator />

          {/* Audience Section */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Target Audience
            </h4>

            {notification.targetType === "all_schools" ? (
              <div className="rounded-md border bg-slate-50 p-3 text-sm flex items-center justify-between">
                <span className="font-semibold text-slate-900">All Registered Schools</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Global Broadcast
                </Badge>
              </div>
            ) : (
              <div className="rounded-md border bg-slate-50 p-3 text-sm space-y-2">
                <div className="flex items-center justify-between font-medium text-slate-900">
                  <span>Selected Schools</span>
                  <span className="text-xs text-slate-500">
                    {notification.targetSchoolCount} {notification.targetSchoolCount === 1 ? "School" : "Schools"}
                  </span>
                </div>
                {notification.targetSchools && notification.targetSchools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {notification.targetSchools.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-700"
                      >
                        <School className="h-3 w-3 mr-1 text-slate-400" />
                        {s.name} ({s.school_code})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Target schools list not loaded.</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Timeline & Lifecycle */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Lifecycle History
            </h4>

            <div className="rounded-md border bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> Created
                </span>
                <span className="font-medium text-slate-800">{formatDate(notification.createdAt)}</span>
              </div>

              {notification.scheduledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Scheduled For
                  </span>
                  <span className="font-medium text-blue-700">{formatDate(notification.scheduledAt)}</span>
                </div>
              )}

              {notification.publishedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Published At
                  </span>
                  <span className="font-medium text-emerald-800">{formatDate(notification.publishedAt)}</span>
                </div>
              )}

              {notification.archivedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Archive className="h-3 w-3 text-zinc-500" /> Archived At
                  </span>
                  <span className="font-medium text-zinc-700">{formatDate(notification.archivedAt)}</span>
                </div>
              )}

              {notification.cancelledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Ban className="h-3 w-3 text-rose-500" /> Cancelled At
                  </span>
                  <span className="font-medium text-rose-700">{formatDate(notification.cancelledAt)}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Author
                </span>
                <span className="font-medium text-slate-800">{notification.createdByName || "Admin"}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
