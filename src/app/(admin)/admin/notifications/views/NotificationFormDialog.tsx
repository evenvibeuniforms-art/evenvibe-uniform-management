"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NotificationRow,
  NotificationType,
  NotificationTargetType,
  SchoolOption,
  CreateNotificationInput,
} from "../types";
import { createNotification, updateDraftNotification } from "../actions";
import { toast } from "sonner";
import { Loader2, Calendar, Send, Save, Clock } from "lucide-react";

interface NotificationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schools: SchoolOption[];
  editingNotification: NotificationRow | null;
  onSuccess: () => void;
}

interface InnerFormProps {
  schools: SchoolOption[];
  editingNotification: NotificationRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

function InnerForm({
  schools,
  editingNotification,
  onClose,
  onSuccess,
}: InnerFormProps) {
  const [loading, setLoading] = useState(false);

  const initialScheduled = (() => {
    if (editingNotification?.status === "scheduled" && editingNotification.scheduledAt) {
      const d = new Date(editingNotification.scheduledAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return {
        mode: "schedule" as const,
        date: `${yyyy}-${mm}-${dd}`,
        time: `${hh}:${min}`,
      };
    }
    return {
      mode: editingNotification ? ("draft" as const) : ("publish_now" as const),
      date: "",
      time: "",
    };
  })();

  const [title, setTitle] = useState(editingNotification?.title || "");
  const [message, setMessage] = useState(editingNotification?.message || "");
  const [notificationType, setNotificationType] = useState<NotificationType>(
    editingNotification?.notificationType || "announcement"
  );
  const [targetType, setTargetType] = useState<NotificationTargetType>(
    editingNotification?.targetType || "all_schools"
  );
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>(
    editingNotification?.targetSchools?.map((s) => s.id) || []
  );
  const [publishMode, setPublishMode] = useState<"draft" | "publish_now" | "schedule">(
    initialScheduled.mode
  );
  const [scheduledDate, setScheduledDate] = useState(initialScheduled.date);
  const [scheduledTime, setScheduledTime] = useState(initialScheduled.time);
  const [schoolSearch, setSchoolSearch] = useState("");

  const toggleSchool = (id: string) => {
    setSelectedSchoolIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const handleSelectAllSchools = () => {
    setSelectedSchoolIds(schools.map((s) => s.id));
  };

  const handleClearAllSchools = () => {
    setSelectedSchoolIds([]);
  };

  const filteredSchools = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
      s.school_code.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!message.trim()) {
      toast.error("Message is required.");
      return;
    }
    if (targetType === "selected_schools" && selectedSchoolIds.length === 0) {
      toast.error("Please select at least one school for targeted delivery.");
      return;
    }

    let scheduledAtIso: string | undefined = undefined;
    if (publishMode === "schedule") {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please provide both scheduled date and time.");
        return;
      }
      const schedTime = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
      if (isNaN(schedTime) || schedTime <= Date.now()) {
        toast.error("Scheduled time must be set to a future timestamp.");
        return;
      }
      scheduledAtIso = new Date(schedTime).toISOString();
    }

    setLoading(true);
    try {
      const payload: CreateNotificationInput = {
        title: title.trim(),
        message: message.trim(),
        notificationType,
        targetType,
        selectedSchoolIds,
        publishMode,
        scheduledAt: scheduledAtIso,
      };

      if (editingNotification) {
        const res = await updateDraftNotification({
          ...payload,
          id: editingNotification.id,
        });
        if (res.success) {
          toast.success(res.message || "Notification updated.");
          onClose();
          onSuccess();
        } else {
          toast.error(res.error || "Failed to update notification.");
        }
      } else {
        const res = await createNotification(payload);
        if (res.success) {
          toast.success(res.message || "Notification created.");
          onClose();
          onSuccess();
        } else {
          toast.error(res.error || "Failed to create notification.");
        }
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-slate-900">
          {editingNotification ? "Edit Notification" : "Create Notification"}
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          Compose announcements, order status updates, or broadcast notifications to schools.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 pt-1">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="notif-title" className="text-xs font-semibold text-slate-700">
            Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Annual Uniform Requirement Submission Deadline"
            className="bg-slate-50 text-sm"
            required
          />
        </div>

        {/* Notification Type & Audience Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Notification Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={notificationType}
              onValueChange={(val) => setNotificationType(val as NotificationType)}
            >
              <SelectTrigger className="bg-slate-50 text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">Announcement</SelectItem>
                <SelectItem value="order">Order Update</SelectItem>
                <SelectItem value="production">Production Notice</SelectItem>
                <SelectItem value="quality_check">Quality Check</SelectItem>
                <SelectItem value="packing">Packing Notice</SelectItem>
                <SelectItem value="delivery">Delivery Dispatch</SelectItem>
                <SelectItem value="system">System Notification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Target Audience <span className="text-red-500">*</span>
            </Label>
            <Select
              value={targetType}
              onValueChange={(val) => setTargetType(val as NotificationTargetType)}
            >
              <SelectTrigger className="bg-slate-50 text-sm">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_schools">All Schools (Broadcast)</SelectItem>
                <SelectItem value="selected_schools">Specific Schools Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Selected Schools Multi-Select Box */}
        {targetType === "selected_schools" && (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Select Target Schools ({selectedSchoolIds.length} selected)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllSchools}
                  className="text-[11px] text-blue-600 hover:underline font-medium"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClearAllSchools}
                  className="text-[11px] text-slate-500 hover:underline font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            <Input
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              placeholder="Filter schools by name or code..."
              className="h-8 text-xs bg-white"
            />

            <div className="max-h-36 overflow-y-auto rounded border bg-white p-2 divide-y divide-slate-100">
              {filteredSchools.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-400">
                  No schools found matching search.
                </div>
              ) : (
                filteredSchools.map((school) => {
                  const isChecked = selectedSchoolIds.includes(school.id);
                  return (
                    <div
                      key={school.id}
                      onClick={() => toggleSchool(school.id)}
                      className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 rounded cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleSchool(school.id)}
                        />
                        <span className="font-medium text-slate-800">{school.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {school.school_code}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Message Body */}
        <div className="space-y-1.5">
          <Label htmlFor="notif-message" className="text-xs font-semibold text-slate-700">
            Message Content <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="notif-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter the full notification message details..."
            rows={4}
            className="bg-slate-50 text-sm resize-none"
            required
          />
        </div>

        {/* Publish Mode */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs font-semibold text-slate-700">
            Delivery Action <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPublishMode("publish_now")}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-medium transition-all ${
                publishMode === "publish_now"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Send className="h-4 w-4 mb-1 text-emerald-600" />
              Publish Now
            </button>

            <button
              type="button"
              onClick={() => setPublishMode("schedule")}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-medium transition-all ${
                publishMode === "schedule"
                  ? "border-blue-500 bg-blue-50 text-blue-800 font-semibold"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Clock className="h-4 w-4 mb-1 text-blue-600" />
              Schedule
            </button>

            <button
              type="button"
              onClick={() => setPublishMode("draft")}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-medium transition-all ${
                publishMode === "draft"
                  ? "border-slate-500 bg-slate-100 text-slate-900 font-semibold"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Save className="h-4 w-4 mb-1 text-slate-500" />
              Save as Draft
            </button>
          </div>
        </div>

        {/* Schedule Fields */}
        {publishMode === "schedule" && (
          <div className="rounded-lg border bg-blue-50/50 p-3 space-y-2 text-xs">
            <span className="font-semibold text-blue-900 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Scheduled Dispatch Time
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-slate-600">Date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="bg-white text-xs h-8"
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600">Time</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="bg-white text-xs h-8"
                  required
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Notification will remain in Scheduled state until the selected timestamp.
            </p>
          </div>
        )}
      </div>

      <DialogFooter className="pt-3 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className={
            publishMode === "publish_now"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : publishMode === "schedule"
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : ""
          }
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : editingNotification ? (
            "Update Notification"
          ) : publishMode === "publish_now" ? (
            "Publish Notification"
          ) : publishMode === "schedule" ? (
            "Schedule Notification"
          ) : (
            "Save as Draft"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NotificationFormDialog({
  open,
  onOpenChange,
  schools,
  editingNotification,
  onSuccess,
}: NotificationFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {open && (
          <InnerForm
            key={editingNotification?.id || "new"}
            schools={schools}
            editingNotification={editingNotification}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
