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
import { NotificationRow } from "../types";
import {
  publishNotification,
  archiveNotification,
  cancelScheduledNotification,
  deleteDraftNotification,
} from "../actions";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Archive,
  Ban,
  Trash2,
} from "lucide-react";

export type StatusActionType =
  | "publish"
  | "archive"
  | "cancel_scheduled"
  | "delete_draft";

interface NotificationStatusDialogProps {
  notification: NotificationRow | null;
  actionType: StatusActionType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NotificationStatusDialog({
  notification,
  actionType,
  open,
  onOpenChange,
  onSuccess,
}: NotificationStatusDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!notification || !actionType) return null;

  const getActionConfig = () => {
    switch (actionType) {
      case "publish":
        return {
          title: "Publish this Notification?",
          description:
            "This announcement will become immediately visible to all targeted schools.",
          confirmText: "Publish Now",
          buttonVariant: "default" as const,
          buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
          icon: <Send className="h-5 w-5 text-emerald-600" />,
          iconBg: "bg-emerald-100",
        };
      case "cancel_scheduled":
        return {
          title: "Cancel this Scheduled Notification?",
          description:
            "This notification will be cancelled and will not be dispatched to schools. Its history will be preserved.",
          confirmText: "Cancel Schedule",
          buttonVariant: "destructive" as const,
          buttonClass: "",
          icon: <Ban className="h-5 w-5 text-rose-600" />,
          iconBg: "bg-rose-100",
        };
      case "archive":
        return {
          title: "Archive this Notification?",
          description:
            "This notification will be moved to archives. Dispatch history and read receipts will remain preserved.",
          confirmText: "Archive Notification",
          buttonVariant: "outline" as const,
          buttonClass: "border-slate-300 text-slate-700 hover:bg-slate-100",
          icon: <Archive className="h-5 w-5 text-zinc-600" />,
          iconBg: "bg-zinc-100",
        };
      case "delete_draft":
        return {
          title: "Delete Draft Notification?",
          description:
            "This draft has never been published. Are you sure you want to permanently delete it?",
          confirmText: "Delete Draft",
          buttonVariant: "destructive" as const,
          buttonClass: "",
          icon: <Trash2 className="h-5 w-5 text-red-600" />,
          iconBg: "bg-red-100",
        };
    }
  };

  const config = getActionConfig();

  const handleConfirm = async () => {
    setLoading(true);
    try {
      let res;
      if (actionType === "publish") {
        res = await publishNotification(notification.id);
      } else if (actionType === "cancel_scheduled") {
        res = await cancelScheduledNotification(notification.id);
      } else if (actionType === "archive") {
        res = await archiveNotification(notification.id);
      } else if (actionType === "delete_draft") {
        res = await deleteDraftNotification(notification.id);
      }

      if (res?.success) {
        toast.success(res.message || "Operation completed successfully.");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res?.error || "Failed to update notification.");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-full ${config.iconBg}`}>
              {config.icon}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {config.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {config.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 border p-3 text-xs space-y-1 text-slate-700 my-2">
          <div>
            <span className="font-semibold text-slate-800">Notification:</span>{" "}
            {notification.title}
          </div>
          <div>
            <span className="font-semibold text-slate-800">Target:</span>{" "}
            {notification.targetType === "all_schools"
              ? "All Schools (Broadcast)"
              : `${notification.targetSchoolCount} Specific Schools`}
          </div>
          <div>
            <span className="font-semibold text-slate-800">Current Status:</span>{" "}
            <span className="capitalize">{notification.status}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Go Back
          </Button>
          <Button
            type="button"
            variant={config.buttonVariant}
            className={config.buttonClass}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              config.confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
