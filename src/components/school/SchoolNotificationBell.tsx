"use client";

import { useState, useTransition } from "react";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Bell, CheckCheck, Circle, Clock, Info } from "lucide-react";
import { SchoolNotificationItem, NotificationType } from "@/app/(admin)/admin/notifications/types";
import {
  markSchoolNotificationAsRead,
  markAllSchoolNotificationsAsRead,
} from "@/app/(admin)/admin/notifications/actions";
import { toast } from "sonner";

interface SchoolNotificationBellProps {
  initialNotifications: SchoolNotificationItem[];
  initialUnreadCount: number;
}

export function SchoolNotificationBell({
  initialNotifications,
  initialUnreadCount,
}: SchoolNotificationBellProps) {
  const [notifications, setNotifications] = useState<SchoolNotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [selectedNotif, setSelectedNotif] = useState<SchoolNotificationItem | null>(null);
  const [isPending, startTransition] = useTransition();

  useRealtimeSubscription({
    table: "notifications",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as Record<string, unknown>;
        if (row.status === "published") {
          const item: SchoolNotificationItem = {
            id: row.id as string,
            title: row.title as string,
            message: row.message as string,
            notification_type: (row.notification_type as NotificationType) || "announcement",
            published_at: (row.published_at as string) || new Date().toISOString(),
            created_at: (row.created_at as string) || new Date().toISOString(),
            is_read: false,
            read_at: null,
          };
          setNotifications((prev) => [item, ...prev.filter((n) => n.id !== item.id)]);
          setUnreadCount((prev) => prev + 1);
          toast.info(`New notification: ${item.title}`);
        }
      }
    },
  });

  useRealtimeSubscription({
    table: "notification_reads",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const readRow = payload.new as Record<string, unknown>;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === readRow.notification_id
              ? { ...n, is_read: true, read_at: (readRow.read_at as string) || new Date().toISOString() }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
  });

  const handleItemClick = (notif: SchoolNotificationItem) => {
    setSelectedNotif(notif);

    if (!notif.is_read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      startTransition(async () => {
        try {
          await markSchoolNotificationAsRead(notif.id);
        } catch {
          // Silent fallback
        }
      });
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    startTransition(async () => {
      try {
        const res = await markAllSchoolNotificationsAsRead();
        if (res.success) {
          toast.success("All notifications marked as read.");
        }
      } catch {
        toast.error("Failed to mark all as read.");
      }
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "Recently";
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="relative inline-flex items-center justify-center h-9 w-9 p-0 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors outline-none focus:ring-2 focus:ring-emerald-500 ring-offset-2"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 shadow-lg border-slate-200">
          <div className="p-3 bg-slate-50 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={isPending}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Info className="h-6 w-6 mx-auto mb-1 text-slate-300" />
                No notifications right now.
              </div>
            ) : (
              notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`p-3 cursor-pointer items-start gap-2.5 transition-colors ${
                    notif.is_read ? "bg-white text-slate-600" : "bg-emerald-50/40 text-slate-900"
                  }`}
                >
                  <div className="pt-0.5">
                    {!notif.is_read ? (
                      <Circle className="h-2 w-2 fill-emerald-600 text-emerald-600" />
                    ) : (
                      <Circle className="h-2 w-2 text-transparent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className={`text-xs leading-snug line-clamp-1 ${notif.is_read ? "font-medium text-slate-800" : "font-bold text-slate-900"}`}>
                      {notif.title}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{formatDate(notif.published_at || notif.created_at)}</span>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected notification details popup */}
      <Dialog open={Boolean(selectedNotif)} onOpenChange={(open) => !open && setSelectedNotif(null)}>
        <DialogContent className="max-w-md">
          {selectedNotif && (
            <>
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {selectedNotif.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(selectedNotif.published_at || selectedNotif.created_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-slate-50 border p-3.5 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed my-2">
                {selectedNotif.message}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
