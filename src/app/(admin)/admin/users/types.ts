export type UserRole = "evenvibe_admin" | "school_admin";

export type UserStatus = "active" | "inactive";

export interface UserManagementRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSignInAt?: string | null;
  emailConfirmedAt?: string | null;
}

export interface UserKPISummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  schoolAdmins: number;
}

export interface UserFilters {
  search: string;
  role: "all" | UserRole;
  schoolId: string;
  status: "all" | UserStatus;
  page: number;
  pageSize: number;
  sortBy: "name" | "role" | "school" | "created_at" | "status";
  sortAsc: boolean;
}

export interface PaginatedUsersResponse {
  users: UserManagementRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: UserKPISummary;
}

export interface SchoolOption {
  id: string;
  name: string;
  school_code: string;
}

export interface ActionResponse<T = void> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
