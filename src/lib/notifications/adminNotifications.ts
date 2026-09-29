"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";

export type AdminBusinessEventType =
  | "NEW_TC_STUDENT"
  | "NEW_ORDER"
  | "NEW_ALTERATION_REQUEST"
  | "NEW_SCHOOL_REGISTERED";

export interface CreateAdminNotificationParams {
  eventType: AdminBusinessEventType;
  title: string;
  message: string;
  link: string;
  metadata: Record<string, unknown>;
  idempotencyKey?: string;
  schoolId?: string;
  entityId?: string;
  notificationType?: "tc_student" | "order" | "alteration" | "school" | "system";
}

export interface AdminBusinessNotificationItem {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  event_type: AdminBusinessEventType | string;
  link: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
}

export interface AdminBusinessNotificationsResponse {
  notifications: AdminBusinessNotificationItem[];
  unreadCount: number;
}

/**
 * Server-authoritative helper to create an Admin business event notification.
 * Uses atomic Postgres RPC with DB-level idempotency protection.
 */
export async function createAdminNotification(
  params: CreateAdminNotificationParams
): Promise<{ success: boolean; id?: string; isDuplicate?: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "create_admin_business_notification",
      {
        p_event_type: params.eventType,
        p_title: params.title,
        p_message: params.message,
        p_link: params.link,
        p_metadata: params.metadata || {},
        p_idempotency_key: params.idempotencyKey || null,
        p_school_id: params.schoolId || null,
        p_entity_id: params.entityId || null,
        p_notification_type: params.notificationType || "system",
      }
    );

    if (error) {
      console.error("[createAdminNotification] RPC error:", error.message);
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; id?: string; is_duplicate?: boolean };
    return {
      success: !!res?.success,
      id: res?.id,
      isDuplicate: !!res?.is_duplicate,
    };
  } catch (err: unknown) {
    console.error("[createAdminNotification] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Fetch business notifications for EvenVibe Admin
 */
export async function getAdminBusinessNotifications(
  limit: number = 20
): Promise<AdminBusinessNotificationsResponse> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "admin_get_business_notifications",
      {
        p_limit: limit,
      }
    );

    if (error) {
      console.error("[getAdminBusinessNotifications] RPC error:", error.message);
      return { notifications: [], unreadCount: 0 };
    }

    const res = data as AdminBusinessNotificationsResponse;
    return {
      notifications: res?.notifications || [],
      unreadCount: res?.unreadCount || 0,
    };
  } catch (err) {
    console.error("[getAdminBusinessNotifications] Unexpected error:", err);
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a single business notification as read for EvenVibe Admin
 */
export async function markAdminBusinessNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase.rpc(
      "admin_mark_business_notification_read",
      {
        p_notification_id: notificationId,
      }
    );

    if (error) {
      console.error("[markAdminBusinessNotificationRead] error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to mark as read";
    return { success: false, error: msg };
  }
}

/**
 * Mark all business notifications as read for EvenVibe Admin
 */
export async function markAllAdminBusinessNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase.rpc(
      "admin_mark_all_business_notifications_read"
    );

    if (error) {
      console.error("[markAllAdminBusinessNotificationsRead] error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to mark all as read";
    return { success: false, error: msg };
  }
}
