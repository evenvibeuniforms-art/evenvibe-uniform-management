"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  UserFilters,
  PaginatedUsersResponse,
  SchoolOption,
  UserManagementRow,
  ActionResponse,
} from "./types";

const uuidSchema = z.string().uuid({ message: "Invalid user ID format." });

const filtersSchema = z.object({
  search: z.string().optional().default(""),
  role: z.enum(["all", "evenvibe_admin", "school_admin"]).optional().default("all"),
  schoolId: z.string().optional().default("all"),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.enum(["name", "role", "school", "created_at", "status"]).optional().default("created_at"),
  sortAsc: z.boolean().optional().default(false),
});

/**
 * Fetch paginated users list with server-side search, filtering, and sorting.
 */
export async function getUsersList(
  rawFilters?: Partial<UserFilters>
): Promise<PaginatedUsersResponse> {
  await requireAdmin();
  const supabase = await createClient();

  const validated = filtersSchema.parse(rawFilters || {});

  const p_search = validated.search.trim() ? validated.search.trim() : null;
  const p_role = validated.role !== "all" ? validated.role : null;
  const p_school_id =
    validated.schoolId !== "all" && validated.schoolId.trim()
      ? validated.schoolId.trim()
      : null;
  const p_status = validated.status !== "all" ? validated.status : null;

  const { data, error } = await supabase.rpc("admin_get_users", {
    p_search,
    p_role,
    p_school_id,
    p_status,
    p_page: validated.page,
    p_page_size: validated.pageSize,
    p_sort_by: validated.sortBy,
    p_sort_asc: validated.sortAsc,
  });

  if (error) {
    console.error("admin_get_users RPC error:", error);
    throw new Error("Unable to load users. Please try again.");
  }

  const raw = data as {
    users: Array<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      role: "evenvibe_admin" | "school_admin";
      school_id: string | null;
      school_name: string | null;
      school_code: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      last_sign_in_at?: string | null;
      email_confirmed_at?: string | null;
    }>;
    totalCount: number;
    page: number;
    pageSize: number;
    kpis: {
      totalUsers: number;
      activeUsers: number;
      inactiveUsers: number;
      schoolAdmins: number;
    };
  };

  const users: UserManagementRow[] = (raw?.users || []).map((u) => ({
    id: u.id,
    fullName: u.full_name || "No Name",
    email: u.email || "No Email",
    phone: u.phone,
    role: u.role,
    schoolId: u.school_id,
    schoolName: u.school_name,
    schoolCode: u.school_code,
    isActive: u.is_active,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? null,
  }));

  return {
    users,
    totalCount: raw?.totalCount ?? 0,
    page: raw?.page ?? validated.page,
    pageSize: raw?.pageSize ?? validated.pageSize,
    kpis: {
      totalUsers: raw?.kpis?.totalUsers ?? 0,
      activeUsers: raw?.kpis?.activeUsers ?? 0,
      inactiveUsers: raw?.kpis?.inactiveUsers ?? 0,
      schoolAdmins: raw?.kpis?.schoolAdmins ?? 0,
    },
  };
}

/**
 * Fetch available schools for filter dropdown.
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
 * Fetch specific user details for inspection.
 */
export async function getUserDetails(
  userId: string
): Promise<UserManagementRow | null> {
  await requireAdmin();
  const validId = uuidSchema.parse(userId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_get_users", {
    p_search: validId,
    p_page: 1,
    p_page_size: 1,
  });

  if (error || !data) {
    console.error("Failed to fetch user details:", error);
    return null;
  }

  const raw = data as { users: Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: "evenvibe_admin" | "school_admin";
    school_id: string | null;
    school_name: string | null;
    school_code: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
  }> };

  const target = (raw.users || []).find((u) => u.id === validId);
  if (!target) return null;

  return {
    id: target.id,
    fullName: target.full_name || "No Name",
    email: target.email || "No Email",
    phone: target.phone,
    role: target.role,
    schoolId: target.school_id,
    schoolName: target.school_name,
    schoolCode: target.school_code,
    isActive: target.is_active,
    createdAt: target.created_at,
    updatedAt: target.updated_at,
    lastSignInAt: target.last_sign_in_at ?? null,
    emailConfirmedAt: target.email_confirmed_at ?? null,
  };
}

/**
 * Activate or deactivate a user (School Admin).
 * Strictly prevents self-deactivation and EvenVive Admin deactivation.
 */
export async function setUserActiveStatus(
  userId: string,
  isActive: boolean
): Promise<ActionResponse<{ userId: string; isActive: boolean }>> {
  try {
    const currentAdmin = await requireAdmin();
    const validId = uuidSchema.parse(userId);

    // Guard against self-deactivation
    if (currentAdmin.id === validId && !isActive) {
      return {
        success: false,
        error: "You cannot deactivate your own account.",
      };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("admin_set_user_active", {
      p_user_id: validId,
      p_is_active: isActive,
    });

    if (error) {
      console.error("admin_set_user_active error:", error);
      return {
        success: false,
        error: error.message || "Failed to update user status.",
      };
    }

    // Revalidate relevant Admin routes
    revalidatePath("/admin/users");
    revalidatePath("/admin/schools");

    return {
      success: true,
      message: isActive
        ? "User account activated successfully."
        : "User account deactivated successfully.",
      data: data as { userId: string; isActive: boolean },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return {
      success: false,
      error: message,
    };
  }
}
