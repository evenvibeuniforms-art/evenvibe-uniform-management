"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  NotificationFilters,
  PaginatedNotificationsResponse,
  SchoolOption,
  CreateNotificationInput,
  UpdateNotificationInput,
  ActionResponse,
  DateFilterPreset,
  SchoolNotificationsResponse,
  NotificationRow,
} from "./types";

const uuidSchema = z.string().uuid({ message: "Invalid ID format." });

const createNotificationSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters."),
  message: z.string().trim().min(2, "Message must be at least 2 characters."),
  notificationType: z.enum([
    "announcement",
    "order",
    "production",
    "quality_check",
    "packing",
    "delivery",
    "system",
  ]),
  targetType: z.enum(["all_schools", "selected_schools"]),
  selectedSchoolIds: z.array(z.string().uuid()),
  publishMode: z.enum(["draft", "publish_now", "schedule"]),
  scheduledAt: z.string().optional(),
});

function getDatePresetBounds(
  preset: DateFilterPreset,
  customStart?: string,
  customEnd?: string
): { start: string | null; end: string | null } {
  if (preset === "all") return { start: null, end: null };

  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(now.getTime() + istOffset);

  if (preset === "today") {
    const startIst = new Date(nowIst);
    startIst.setUTCHours(0, 0, 0, 0);
    const endIst = new Date(nowIst);
    endIst.setUTCHours(23, 59, 59, 999);
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: new Date(endIst.getTime() - istOffset).toISOString(),
    };
  }

  if (preset === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }

  if (preset === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }

  if (preset === "this_month") {
    const startIst = new Date(
      Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1)
    );
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: now.toISOString(),
    };
  }

  if (preset === "last_month") {
    const startIst = new Date(
      Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - 1, 1)
    );
    const endIst = new Date(
      Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 0, 23, 59, 59, 999)
    );
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: new Date(endIst.getTime() - istOffset).toISOString(),
    };
  }

  if (preset === "custom") {
    return {
      start: customStart ? new Date(customStart).toISOString() : null,
      end: customEnd ? new Date(customEnd).toISOString() : null,
    };
  }

  return { start: null, end: null };
}

/**
 * Fetch paginated notifications with filters for Admin
 */
export async function getNotificationsList(
  rawFilters?: Partial<NotificationFilters>
): Promise<PaginatedNotificationsResponse> {
  await requireAdmin();
  const supabase = await createClient();

  const search = rawFilters?.search?.trim() || null;
  const status = rawFilters?.status && rawFilters.status !== "all" ? rawFilters.status : null;
  const type = rawFilters?.type && rawFilters.type !== "all" ? rawFilters.type : null;
  const targetType =
    rawFilters?.targetType && rawFilters.targetType !== "all"
      ? rawFilters.targetType
      : null;
  const page = rawFilters?.page && rawFilters.page > 0 ? rawFilters.page : 1;
  const pageSize =
    rawFilters?.pageSize && rawFilters.pageSize > 0 ? rawFilters.pageSize : 10;
  const sortBy = rawFilters?.sortBy || "created_at";
  const sortAsc = rawFilters?.sortAsc ?? false;

  const datePreset = rawFilters?.datePreset || "all";
  const { start, end } = getDatePresetBounds(
    datePreset,
    rawFilters?.customStartDate,
    rawFilters?.customEndDate
  );

  const { data, error } = await supabase.rpc("admin_get_notifications", {
    p_search: search,
    p_status: status,
    p_type: type,
    p_target_type: targetType,
    p_start_date: start,
    p_end_date: end,
    p_page: page,
    p_page_size: pageSize,
    p_sort_by: sortBy,
    p_sort_asc: sortAsc,
  });

  if (error) {
    console.error("admin_get_notifications error:", error);
    throw new Error("Unable to load notifications. Please try again.");
  }

  const raw = data as {
    notifications: Array<{
      id: string;
      title: string;
      message: string;
      notification_type: NotificationRow["notificationType"];
      status: NotificationRow["status"];
      target_type: NotificationRow["targetType"];
      created_by: string | null;
      created_by_name: string | null;
      scheduled_at: string | null;
      published_at: string | null;
      archived_at: string | null;
      cancelled_at: string | null;
      created_at: string;
      updated_at: string;
      target_school_count: number;
      target_schools: Array<{ id: string; name: string; school_code: string }>;
    }>;
    totalCount: number;
    page: number;
    pageSize: number;
    kpis: {
      totalNotifications: number;
      drafts: number;
      scheduled: number;
      published: number;
      archived: number;
    };
  };

  const notifications: NotificationRow[] = (raw?.notifications || []).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    notificationType: n.notification_type,
    status: n.status,
    targetType: n.target_type,
    targetSchoolCount: n.target_school_count ?? 0,
    targetSchools: n.target_schools || [],
    createdBy: n.created_by,
    createdByName: n.created_by_name || "Admin",
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    scheduledAt: n.scheduled_at,
    publishedAt: n.published_at,
    archivedAt: n.archived_at,
    cancelledAt: n.cancelled_at,
  }));

  return {
    notifications,
    totalCount: raw?.totalCount ?? 0,
    page: raw?.page ?? page,
    pageSize: raw?.pageSize ?? pageSize,
    kpis: {
      totalNotifications: raw?.kpis?.totalNotifications ?? 0,
      drafts: raw?.kpis?.drafts ?? 0,
      scheduled: raw?.kpis?.scheduled ?? 0,
      published: raw?.kpis?.published ?? 0,
      archived: raw?.kpis?.archived ?? 0,
    },
  };
}

/**
 * Fetch available schools for target selection dropdown
 */
export async function getSchoolOptions(): Promise<SchoolOption[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("schools")
    .select("id, name, school_code")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch school options:", error);
    return [];
  }

  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    school_code: s.school_code,
  }));
}

/**
 * Create a new notification (Draft, Published Now, or Scheduled)
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<ActionResponse<{ id: string }>> {
  try {
    const currentAdmin = await requireAdmin();
    const validated = createNotificationSchema.parse(input);

    if (
      validated.targetType === "selected_schools" &&
      validated.selectedSchoolIds.length === 0
    ) {
      return {
        success: false,
        error: "Please select at least one school for targeted delivery.",
      };
    }

    if (validated.publishMode === "schedule") {
      if (!validated.scheduledAt) {
        return {
          success: false,
          error: "Scheduled date and time are required for scheduling.",
        };
      }
      const schedTime = new Date(validated.scheduledAt).getTime();
      if (isNaN(schedTime) || schedTime <= Date.now()) {
        return {
          success: false,
          error: "Scheduled time must be set to a future timestamp.",
        };
      }
    }

    const supabase = await createClient();

    let status = "draft";
    let publishedAt: string | null = null;
    let scheduledAt: string | null = null;

    if (validated.publishMode === "publish_now") {
      status = "published";
      publishedAt = new Date().toISOString();
    } else if (validated.publishMode === "schedule") {
      status = "scheduled";
      scheduledAt = new Date(validated.scheduledAt!).toISOString();
    }

    // Insert notification
    const { data: newNotif, error: notifError } = await supabase
      .from("notifications")
      .insert({
        title: validated.title,
        message: validated.message,
        notification_type: validated.notificationType,
        target_type: validated.targetType,
        status,
        created_by: currentAdmin.id,
        published_at: publishedAt,
        scheduled_at: scheduledAt,
      })
      .select("id")
      .single();

    if (notifError || !newNotif) {
      console.error("Failed to insert notification:", notifError);
      return {
        success: false,
        error: "Unable to create notification. Please try again.",
      };
    }

    // Insert school targets if selected_schools
    if (
      validated.targetType === "selected_schools" &&
      validated.selectedSchoolIds.length > 0
    ) {
      const targetRows = validated.selectedSchoolIds.map((schoolId) => ({
        notification_id: newNotif.id,
        school_id: schoolId,
      }));

      const { error: targetError } = await supabase
        .from("notification_targets")
        .insert(targetRows);

      if (targetError) {
        console.error("Failed to insert notification targets:", targetError);
        // Rollback notification to prevent corrupt state
        await supabase.from("notifications").delete().eq("id", newNotif.id);
        return {
          success: false,
          error: "Failed to map target schools. Please try again.",
        };
      }
    }

    revalidatePath("/admin/notifications");

    const message =
      validated.publishMode === "publish_now"
        ? "Notification published successfully."
        : validated.publishMode === "schedule"
        ? "Notification scheduled successfully."
        : "Draft notification saved.";

    return {
      success: true,
      message,
      data: { id: newNotif.id },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Update an existing draft notification
 */
export async function updateDraftNotification(
  input: UpdateNotificationInput
): Promise<ActionResponse<{ id: string }>> {
  try {
    await requireAdmin();
    const validId = uuidSchema.parse(input.id);
    const validated = createNotificationSchema.parse(input);

    const supabase = await createClient();

    // Verify existing status is draft
    const { data: existing, error: findError } = await supabase
      .from("notifications")
      .select("id, status")
      .eq("id", validId)
      .single();

    if (findError || !existing) {
      return { success: false, error: "Notification not found." };
    }

    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return {
        success: false,
        error: "Only draft or scheduled notifications can be edited.",
      };
    }

    if (
      validated.targetType === "selected_schools" &&
      validated.selectedSchoolIds.length === 0
    ) {
      return {
        success: false,
        error: "Please select at least one school for targeted delivery.",
      };
    }

    let status = existing.status;
    let publishedAt: string | null = null;
    let scheduledAt: string | null = null;

    if (validated.publishMode === "publish_now") {
      status = "published";
      publishedAt = new Date().toISOString();
    } else if (validated.publishMode === "schedule") {
      if (!validated.scheduledAt) {
        return {
          success: false,
          error: "Scheduled date and time are required for scheduling.",
        };
      }
      const schedTime = new Date(validated.scheduledAt).getTime();
      if (isNaN(schedTime) || schedTime <= Date.now()) {
        return {
          success: false,
          error: "Scheduled time must be in the future.",
        };
      }
      status = "scheduled";
      scheduledAt = new Date(validated.scheduledAt).toISOString();
    } else {
      status = "draft";
    }

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        title: validated.title,
        message: validated.message,
        notification_type: validated.notificationType,
        target_type: validated.targetType,
        status,
        published_at: publishedAt,
        scheduled_at: scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", validId);

    if (updateError) {
      console.error("Failed to update notification:", updateError);
      return { success: false, error: "Failed to update notification." };
    }

    // Refresh targets
    await supabase
      .from("notification_targets")
      .delete()
      .eq("notification_id", validId);

    if (
      validated.targetType === "selected_schools" &&
      validated.selectedSchoolIds.length > 0
    ) {
      const targetRows = validated.selectedSchoolIds.map((schoolId) => ({
        notification_id: validId,
        school_id: schoolId,
      }));

      await supabase.from("notification_targets").insert(targetRows);
    }

    revalidatePath("/admin/notifications");

    return {
      success: true,
      message:
        validated.publishMode === "publish_now"
          ? "Notification published successfully."
          : "Notification updated successfully.",
      data: { id: validId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Publish a draft or scheduled notification immediately
 */
export async function publishNotification(
  notificationId: string
): Promise<ActionResponse> {
  try {
    await requireAdmin();
    const validId = uuidSchema.parse(notificationId);
    const supabase = await createClient();

    const { data: notif, error: findError } = await supabase
      .from("notifications")
      .select("id, status")
      .eq("id", validId)
      .single();

    if (findError || !notif) {
      return { success: false, error: "Notification not found." };
    }

    if (notif.status === "published") {
      return { success: false, error: "Notification is already published." };
    }

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validId);

    if (updateError) {
      console.error("Error publishing notification:", updateError);
      return { success: false, error: "Failed to publish notification." };
    }

    revalidatePath("/admin/notifications");
    return { success: true, message: "Notification published successfully." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Archive a published notification (soft archive to preserve history)
 */
export async function archiveNotification(
  notificationId: string
): Promise<ActionResponse> {
  try {
    await requireAdmin();
    const validId = uuidSchema.parse(notificationId);
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validId);

    if (error) {
      console.error("Error archiving notification:", error);
      return { success: false, error: "Failed to archive notification." };
    }

    revalidatePath("/admin/notifications");
    return { success: true, message: "Notification archived." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelScheduledNotification(
  notificationId: string
): Promise<ActionResponse> {
  try {
    await requireAdmin();
    const validId = uuidSchema.parse(notificationId);
    const supabase = await createClient();

    const { data: notif, error: findError } = await supabase
      .from("notifications")
      .select("id, status")
      .eq("id", validId)
      .single();

    if (findError || !notif) {
      return { success: false, error: "Notification not found." };
    }

    if (notif.status !== "scheduled") {
      return {
        success: false,
        error: "Only scheduled notifications can be cancelled.",
      };
    }

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validId);

    if (updateError) {
      console.error("Error cancelling scheduled notification:", updateError);
      return { success: false, error: "Failed to cancel notification." };
    }

    revalidatePath("/admin/notifications");
    return { success: true, message: "Scheduled notification cancelled." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Delete a draft notification before publication
 */
export async function deleteDraftNotification(
  notificationId: string
): Promise<ActionResponse> {
  try {
    await requireAdmin();
    const validId = uuidSchema.parse(notificationId);
    const supabase = await createClient();

    const { data: notif, error: findError } = await supabase
      .from("notifications")
      .select("id, status")
      .eq("id", validId)
      .single();

    if (findError || !notif) {
      return { success: false, error: "Notification not found." };
    }

    if (notif.status !== "draft") {
      return {
        success: false,
        error: "Only draft notifications can be permanently deleted.",
      };
    }

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", validId);

    if (deleteError) {
      console.error("Error deleting draft notification:", deleteError);
      return { success: false, error: "Failed to delete draft notification." };
    }

    revalidatePath("/admin/notifications");
    return { success: true, message: "Draft notification deleted." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

// -------------------------------------------------------------
// School Admin Notifications Actions
// -------------------------------------------------------------

/**
 * Fetch visible notifications for the authenticated School Admin
 */
export async function getSchoolNotifications(
  page: number = 1,
  pageSize: number = 10
): Promise<SchoolNotificationsResponse> {
  await requireSchoolAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("school_get_notifications", {
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    console.error("school_get_notifications error:", error);
    return {
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      page: 1,
      pageSize,
    };
  }

  const raw = data as SchoolNotificationsResponse;
  return {
    notifications: raw?.notifications || [],
    totalCount: raw?.totalCount || 0,
    unreadCount: raw?.unreadCount || 0,
    page: raw?.page || 1,
    pageSize: raw?.pageSize || pageSize,
  };
}

/**
 * Mark a single notification as read for authenticated School Admin
 */
export async function markSchoolNotificationAsRead(
  notificationId: string
): Promise<ActionResponse> {
  try {
    await requireSchoolAdmin();
    const validId = uuidSchema.parse(notificationId);
    const supabase = await createClient();

    const { error } = await supabase.rpc("school_mark_notification_read", {
      p_notification_id: validId,
    });

    if (error) {
      console.error("Error marking notification as read:", error);
      return { success: false, error: "Failed to mark as read." };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Mark all notifications as read for authenticated School Admin
 */
export async function markAllSchoolNotificationsAsRead(): Promise<ActionResponse> {
  try {
    await requireSchoolAdmin();
    const supabase = await createClient();

    const { error } = await supabase.rpc("school_mark_all_notifications_read");

    if (error) {
      console.error("Error marking all notifications as read:", error);
      return { success: false, error: "Failed to mark all as read." };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}
