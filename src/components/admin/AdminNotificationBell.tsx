"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  CheckCheck,
  Circle,
  Clock,
  Info,
  Package,
  Scissors,
  GraduationCap,
  School,
  ExternalLink,
} from "lucide-react";
import {
  AdminBusinessNotificationItem,
  markAdminBusinessNotificationRead,
  markAllAdminBusinessNotificationsRead,
} from "@/lib/notifications/adminNotifications";
import { toast } from "sonner";

interface AdminNotificationBellProps {
  initialNotifications: AdminBusinessNotificationItem[];
  initialUnreadCount: number;
}

export function AdminNotificationBell({
  initialNotifications,
  initialUnreadCount,
}: AdminNotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] =
    useState<AdminBusinessNotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();

  // Supabase Realtime subscription to new notifications
  useRealtimeSubscription({
    table: "notifications",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as Record<string, unknown>;
        // Only react to notifications intended for Admin
        if (row.target_type === "admin" && row.status === "published") {
          const rawLink = (row.link as string) || null;
          let resolvedLink = rawLink;
          if (row.event_type === "NEW_SCHOOL_REGISTERED") {
            resolvedLink = "/admin/schools";
          } else if (row.event_type === "NEW_ALTERATION_REQUEST") {
            resolvedLink = "/admin/alterations";
          }

          const item: AdminBusinessNotificationItem = {
            id: row.id as string,
            title: row.title as string,
            message: row.message as string,
            notification_type: (row.notification_type as string) || "system",
            event_type: (row.event_type as string) || "BUSINESS_EVENT",
            link: resolvedLink,
            metadata: (row.metadata as Record<string, unknown>) || {},
            created_at: (row.created_at as string) || new Date().toISOString(),
            is_read: false,
            read_at: null,
          };

          setNotifications((prev) => [
            item,
            ...prev.filter((n) => n.id !== item.id),
          ]);
          setUnreadCount((prev) => prev + 1);
          toast.info(item.title, {
            description: item.message,
          });
        }
      }
    },
  });

  // Supabase Realtime subscription to read receipts
  useRealtimeSubscription({
    table: "notification_reads",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const readRow = payload.new as Record<string, unknown>;
        const notifId = readRow.notification_id as string;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notifId
              ? {
                  ...n,
                  is_read: true,
                  read_at:
                    (readRow.read_at as string) || new Date().toISOString(),
                }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
  });

  const handleItemClick = (notif: AdminBusinessNotificationItem) => {
    if (!notif.is_read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      startTransition(async () => {
        try {
          await markAdminBusinessNotificationRead(notif.id);
        } catch (err) {
          console.warn("[AdminNotificationBell] mark read error:", err);
        }
      });
    }

    let targetLink = notif.link;
    if (notif.event_type === "NEW_SCHOOL_REGISTERED") {
      targetLink = "/admin/schools";
    } else if (notif.event_type === "NEW_ALTERATION_REQUEST") {
      targetLink = "/admin/alterations";
    }

    if (targetLink) {
      router.push(targetLink);
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;

    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: new Date().toISOString(),
      }))
    );
    setUnreadCount(0);

    startTransition(async () => {
      try {
        const res = await markAllAdminBusinessNotificationsRead();
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

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "NEW_ORDER":
        return <Package className="h-4 w-4 text-evenvibe-primary shrink-0" />;
      case "NEW_ALTERATION_REQUEST":
        return <Scissors className="h-4 w-4 text-status-warning shrink-0" />;
      case "NEW_TC_STUDENT":
        return <GraduationCap className="h-4 w-4 text-blue-600 shrink-0" />;
      case "NEW_SCHOOL_REGISTERED":
        return <School className="h-4 w-4 text-evenvibe-primary shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-slate-500 shrink-0" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative inline-flex items-center justify-center h-9 w-9 p-0 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors outline-none focus:ring-2 focus:ring-emerald-500 ring-offset-2"
        title="Admin Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-evenvibe-primary text-[10px] font-bold text-white shadow animate-in fade-in zoom-in duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0 shadow-lg border-slate-200 z-50 bg-white"
      >
        <div className="p-3 bg-slate-50 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">
                Admin Notifications
              </span>
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
                className="text-xs text-evenvibe-deep hover:text-emerald-800 font-medium flex items-center gap-1 cursor-pointer transition-colors"
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
              No notifications yet.
            </div>
          ) : (
            notifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`p-3 cursor-pointer items-start gap-2.5 transition-colors ${
                  notif.is_read
                    ? "bg-white text-slate-600 hover:bg-slate-50"
                    : "bg-emerald-50/40 text-slate-900 hover:bg-emerald-50/70"
                }`}
              >
                <div className="pt-0.5">
                  {!notif.is_read ? (
                    <Circle className="h-2 w-2 fill-emerald-600 text-evenvibe-primary" />
                  ) : (
                    <Circle className="h-2 w-2 text-transparent" />
                  )}
                </div>

                <div className="pt-0.5">
                  {getEventIcon(notif.event_type)}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs leading-snug line-clamp-1 ${
                        notif.is_read
                          ? "font-medium text-slate-800"
                          : "font-bold text-slate-900"
                      }`}
                    >
                      {notif.title}
                    </p>
                    {notif.link && (
                      <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatDate(notif.created_at)}</span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
