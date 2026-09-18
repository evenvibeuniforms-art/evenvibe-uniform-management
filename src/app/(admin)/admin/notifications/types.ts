export type NotificationStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived"
  | "cancelled";

export type NotificationTargetType = "all_schools" | "selected_schools";

export type NotificationType =
  | "announcement"
  | "order"
  | "production"
  | "quality_check"
  | "packing"
  | "delivery"
  | "system";

export interface TargetSchoolItem {
  id: string;
  name: string;
  school_code: string;
}

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  status: NotificationStatus;
  targetType: NotificationTargetType;
  targetSchoolCount: number;
  targetSchools?: TargetSchoolItem[];
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  cancelledAt: string | null;
}

export interface NotificationKPISummary {
  totalNotifications: number;
  drafts: number;
  scheduled: number;
  published: number;
  archived: number;
}

export type DateFilterPreset =
  | "all"
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

export interface NotificationFilters {
  search: string;
  status: "all" | NotificationStatus;
  type: "all" | NotificationType;
  targetType: "all" | NotificationTargetType;
  datePreset: DateFilterPreset;
  customStartDate?: string;
  customEndDate?: string;
  page: number;
  pageSize: number;
  sortBy: "created_at" | "title" | "status" | "type";
  sortAsc: boolean;
}

export interface PaginatedNotificationsResponse {
  notifications: NotificationRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: NotificationKPISummary;
}

export interface SchoolOption {
  id: string;
  name: string;
  school_code: string;
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  notificationType: NotificationType;
  targetType: NotificationTargetType;
  selectedSchoolIds: string[];
  publishMode: "draft" | "publish_now" | "schedule";
  scheduledAt?: string; // ISO string
}

export interface UpdateNotificationInput extends CreateNotificationInput {
  id: string;
}

export interface ActionResponse<T = void> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// School Admin Notification Item
export interface SchoolNotificationItem {
  id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  created_at: string;
  published_at: string | null;
  is_read: boolean;
  read_at: string | null;
}

export interface SchoolNotificationsResponse {
  notifications: SchoolNotificationItem[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}
