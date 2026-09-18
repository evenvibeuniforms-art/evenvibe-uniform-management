"use server";

/**
 * Server Actions for Admin Settings & Configuration
 */
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CompanySettings,
  NotificationSettings,
  SystemPreferences,
  OrderStatusItem,
  AdminSettingsData,
  ActionResponse,
} from "./types";

const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters."),
  website: z.string().trim().url("Please enter a valid URL (e.g., https://evenvibeuniforms.art)").or(z.literal("")),
  email: z.string().trim().email("Please enter a valid email address.").or(z.literal("")),
  phone: z.string().trim().min(6, "Please enter a valid phone number.").or(z.literal("")),
  address: z.string().trim().max(250, "Address is too long."),
  city: z.string().trim().max(100, "City name is too long."),
  state: z.string().trim().max(100, "State name is too long."),
  pincode: z.string().trim().regex(/^(\d{6})?$/, "Pincode must be 6 digits if provided."),
});

const notificationSettingsSchema = z.object({
  enableInAppNotifications: z.boolean(),
  defaultBroadcastVisibility: z.boolean(),
  allowSchoolAdminUnreadBadge: z.boolean(),
  notificationRetentionDays: z.number().int().min(7).max(365),
});

const systemPreferencesSchema = z.object({
  defaultPageSize: z.number().int().refine((val) => [10, 20, 50].includes(val), {
    message: "Page size must be 10, 20, or 50.",
  }),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  timezone: z.literal("Asia/Kolkata"),
  enableAutoRefresh: z.boolean(),
});

const ORDER_STATUS_LIFECYCLE: OrderStatusItem[] = [
  {
    key: "submitted",
    label: "Submitted",
    phase: "Order Intake",
    description: "School has submitted annual uniform requirements for review.",
    cancellationAllowed: true,
  },
  {
    key: "under_review",
    label: "Being Reviewed",
    phase: "Review",
    description: "EvenVive Admin is inspecting sizes, class items, and quantities.",
    cancellationAllowed: true,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    phase: "Confirmation",
    description: "Requirements verified and confirmed for production scheduling.",
    cancellationAllowed: true,
  },
  {
    key: "production",
    label: "Production",
    phase: "Manufacturing",
    description: "Uniforms in fabric cutting, stitching, and finishing processes.",
    cancellationAllowed: false,
  },
  {
    key: "quality_check",
    label: "Quality Checking",
    phase: "Quality Assurance",
    description: "Batch measurement and stitching quality inspection.",
    cancellationAllowed: false,
  },
  {
    key: "packed",
    label: "Packed",
    phase: "Packaging",
    description: "Student uniforms sorted, bagged, and boxed into school cartons.",
    cancellationAllowed: false,
  },
  {
    key: "dispatched",
    label: "Dispatched",
    phase: "Logistics",
    description: "Consignment handed over to transport/logistics carrier.",
    cancellationAllowed: false,
  },
  {
    key: "in_transit",
    label: "On the Way",
    phase: "Logistics",
    description: "Shipment in transit towards the school campus.",
    cancellationAllowed: false,
  },
  {
    key: "delivered",
    label: "Delivered",
    phase: "Completion",
    description: "Delivery acknowledged and handed over to the school admin.",
    cancellationAllowed: false,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    phase: "Closed",
    description: "Order cancelled before production initiation.",
    cancellationAllowed: false,
  },
];

const DEFAULT_COMPANY: CompanySettings = {
  companyName: "EvenVive Uniforms",
  website: "https://evenvibeuniforms.art",
  email: "contact@evenvibeuniforms.art",
  phone: "+91 98765 43210",
  address: "123 Industrial Estate, Guindy",
  city: "Chennai",
  state: "Tamil Nadu",
  pincode: "600032",
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enableInAppNotifications: true,
  defaultBroadcastVisibility: true,
  allowSchoolAdminUnreadBadge: true,
  notificationRetentionDays: 90,
};

const DEFAULT_PREFERENCES: SystemPreferences = {
  defaultPageSize: 10,
  dateFormat: "DD/MM/YYYY",
  timezone: "Asia/Kolkata",
  enableAutoRefresh: false,
};

/**
 * Fetch all admin settings
 */
export async function getAdminSettings(): Promise<AdminSettingsData> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_key, setting_value, updated_at, updated_by")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch system_settings:", error);
  }

  const map = new Map<string, unknown>();
  let latestUpdatedAt: string | null = null;

  (data || []).forEach((row) => {
    map.set(row.setting_key, row.setting_value);
    if (!latestUpdatedAt || (row.updated_at && row.updated_at > latestUpdatedAt)) {
      latestUpdatedAt = row.updated_at;
    }
  });

  const company = (map.get("company_info") as CompanySettings) || DEFAULT_COMPANY;
  const notifications =
    (map.get("notification_preferences") as NotificationSettings) ||
    DEFAULT_NOTIFICATIONS;
  const preferences =
    (map.get("system_preferences") as SystemPreferences) || DEFAULT_PREFERENCES;

  return {
    company: {
      companyName: company.companyName ?? DEFAULT_COMPANY.companyName,
      website: company.website ?? DEFAULT_COMPANY.website,
      email: company.email ?? DEFAULT_COMPANY.email,
      phone: company.phone ?? DEFAULT_COMPANY.phone,
      address: company.address ?? DEFAULT_COMPANY.address,
      city: company.city ?? DEFAULT_COMPANY.city,
      state: company.state ?? DEFAULT_COMPANY.state,
      pincode: company.pincode ?? DEFAULT_COMPANY.pincode,
    },
    notifications: {
      enableInAppNotifications:
        notifications.enableInAppNotifications ??
        DEFAULT_NOTIFICATIONS.enableInAppNotifications,
      defaultBroadcastVisibility:
        notifications.defaultBroadcastVisibility ??
        DEFAULT_NOTIFICATIONS.defaultBroadcastVisibility,
      allowSchoolAdminUnreadBadge:
        notifications.allowSchoolAdminUnreadBadge ??
        DEFAULT_NOTIFICATIONS.allowSchoolAdminUnreadBadge,
      notificationRetentionDays:
        notifications.notificationRetentionDays ??
        DEFAULT_NOTIFICATIONS.notificationRetentionDays,
    },
    preferences: {
      defaultPageSize:
        preferences.defaultPageSize ?? DEFAULT_PREFERENCES.defaultPageSize,
      dateFormat:
        preferences.dateFormat ?? DEFAULT_PREFERENCES.dateFormat,
      timezone: "Asia/Kolkata",
      enableAutoRefresh:
        preferences.enableAutoRefresh ?? DEFAULT_PREFERENCES.enableAutoRefresh,
    },
    orderStatuses: ORDER_STATUS_LIFECYCLE,
    updatedAt: latestUpdatedAt,
  };
}

/**
 * Update Company Information
 */
export async function updateCompanySettings(
  input: CompanySettings
): Promise<ActionResponse> {
  try {
    const admin = await requireAdmin();
    const validated = companySettingsSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: "company_info",
          setting_value: validated,
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (error) {
      console.error("Failed to update company_info:", error);
      return { success: false, error: "Unable to update company settings. Please try again." };
    }

    revalidatePath("/admin/settings");
    return { success: true, message: "Company information updated successfully." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Update Notification Preferences
 */
export async function updateNotificationSettings(
  input: NotificationSettings
): Promise<ActionResponse> {
  try {
    const admin = await requireAdmin();
    const validated = notificationSettingsSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: "notification_preferences",
          setting_value: validated,
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (error) {
      console.error("Failed to update notification_preferences:", error);
      return { success: false, error: "Unable to update notification settings. Please try again." };
    }

    revalidatePath("/admin/settings");
    return { success: true, message: "Notification preferences updated successfully." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

/**
 * Update System Preferences
 */
export async function updateSystemPreferences(
  input: SystemPreferences
): Promise<ActionResponse> {
  try {
    const admin = await requireAdmin();
    const validated = systemPreferencesSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: "system_preferences",
          setting_value: validated,
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (error) {
      console.error("Failed to update system_preferences:", error);
      return { success: false, error: "Unable to update system preferences. Please try again." };
    }

    revalidatePath("/admin/settings");
    return { success: true, message: "System preferences updated successfully." };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}
