export interface CompanySettings {
  companyName: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface NotificationSettings {
  enableInAppNotifications: boolean;
  defaultBroadcastVisibility: boolean;
  allowSchoolAdminUnreadBadge: boolean;
  notificationRetentionDays: number;
}

export interface SystemPreferences {
  defaultPageSize: number;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timezone: string;
  enableAutoRefresh: boolean;
}

export interface OrderStatusItem {
  key: string;
  label: string;
  phase: string;
  description: string;
  cancellationAllowed: boolean;
}

export interface AdminSettingsData {
  company: CompanySettings;
  notifications: NotificationSettings;
  preferences: SystemPreferences;
  orderStatuses: OrderStatusItem[];
  updatedAt?: string | null;
  updatedByName?: string | null;
}

export interface ActionResponse<T = void> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
