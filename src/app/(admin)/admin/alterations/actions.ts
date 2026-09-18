"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export interface AdminAlterationsSummary {
  total: number;
  requested: number;
  under_review: number;
  approved_rework: number;
  completed: number;
  rejected: number;
}

export interface AdminAlterationListItem {
  id: string;
  request_number: string;
  status: string;
  item_name: string;
  issue_type: string;
  quantity: number;
  current_size: string | null;
  required_size: string | null;
  remarks: string | null;
  proof_photo_url: string | null;
  created_at: string;
  rejection_reason: string | null;
  rework_remarks: string | null;
  completed_remarks: string | null;
  school: {
    id: string;
    name: string;
    school_code?: string;
  } | null;
  order: {
    id: string;
    order_number: string;
    created_at: string;
    delivered_at: string | null;
  } | null;
  student: {
    id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section: string;
    gender: string;
  } | null;
}

/**
 * 1. Admin Alterations Summary
 */
export async function getAdminAlterationsSummary(): Promise<{
  success: boolean;
  summary: AdminAlterationsSummary;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("alteration_requests")
      .select("status");

    if (error) {
      console.error("Error in getAdminAlterationsSummary:", error);
      return {
        success: false,
        summary: { total: 0, requested: 0, under_review: 0, approved_rework: 0, completed: 0, rejected: 0 },
        error: "Unable to load alteration summary. Please try again.",
      };
    }

    const summary: AdminAlterationsSummary = {
      total: data?.length || 0,
      requested: 0,
      under_review: 0,
      approved_rework: 0,
      completed: 0,
      rejected: 0,
    };

    data?.forEach((row) => {
      if (row.status === "requested") summary.requested++;
      else if (row.status === "under_review") summary.under_review++;
      else if (row.status === "approved" || row.status === "rework") summary.approved_rework++;
      else if (row.status === "completed") summary.completed++;
      else if (row.status === "rejected") summary.rejected++;
    });

    return { success: true, summary };
  } catch (err) {
    console.error("Error in getAdminAlterationsSummary:", err);
    return {
      success: false,
      summary: { total: 0, requested: 0, under_review: 0, approved_rework: 0, completed: 0, rejected: 0 },
      error: "Unable to load alteration summary.",
    };
  }
}

/**
 * 2. Admin Alterations List (Search, Filter, Pagination)
 */
export interface AdminAlterationsFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  reason?: string;
  schoolId?: string;
  dateRange?: "all" | "today" | "last_7_days" | "last_30_days" | "this_month";
}

export async function getAdminAlterationsList(params: AdminAlterationsFilterParams) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(50, params.pageSize || 10));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("alteration_requests")
      .select(
        `
        id, request_number, status, item_name, item_type, issue_type, quantity,
        current_size, required_size, remarks, description, proof_photo_url, created_at,
        rejection_reason, rework_remarks, completed_remarks,
        schools (id, name, school_code),
        orders (id, order_number, created_at, delivered_at),
        students (id, student_name, admission_number, class_name, section, gender)
      `,
        { count: "exact" }
      );

    // School filter
    if (params.schoolId && params.schoolId !== "all") {
      query = query.eq("school_id", params.schoolId);
    }

    // Status filter
    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    // Reason filter
    if (params.reason && params.reason !== "all") {
      query = query.eq("issue_type", params.reason);
    }

    // Date range filter
    if (params.dateRange && params.dateRange !== "all") {
      const now = new Date();
      if (params.dateRange === "today") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte("created_at", startOfDay);
      } else if (params.dateRange === "last_7_days") {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", sevenDaysAgo);
      } else if (params.dateRange === "last_30_days") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", thirtyDaysAgo);
      } else if (params.dateRange === "this_month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte("created_at", startOfMonth);
      }
    }

    // Server-side text search on request_number and item_name
    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      query = query.or(`request_number.ilike.%${s}%,item_name.ilike.%${s}%`);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching admin alterations list:", error);
      return {
        success: false,
        alterations: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: "Unable to load alteration requests. Please try again.",
      };
    }

    const alterations: AdminAlterationListItem[] = (data || []).map((row) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students;
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;

      return {
        id: row.id,
        request_number: row.request_number,
        status: row.status,
        item_name: row.item_name || row.item_type || "Uniform Item",
        issue_type: row.issue_type,
        quantity: row.quantity || 1,
        current_size: row.current_size,
        required_size: row.required_size,
        remarks: row.remarks || row.description,
        proof_photo_url: row.proof_photo_url,
        created_at: row.created_at,
        rejection_reason: row.rejection_reason,
        rework_remarks: row.rework_remarks,
        completed_remarks: row.completed_remarks,
        school: school ? { id: school.id, name: school.name, school_code: school.school_code } : null,
        order: order
          ? {
              id: order.id,
              order_number: order.order_number,
              created_at: order.created_at,
              delivered_at: order.delivered_at,
            }
          : null,
        student: student
          ? {
              id: student.id,
              student_name: student.student_name,
              admission_number: student.admission_number,
              class_name: student.class_name,
              section: student.section,
              gender: student.gender,
            }
          : null,
      };
    });

    // Client-side text filter fallback for school / order / student search matches
    let finalAlterations = alterations;
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      finalAlterations = alterations.filter(
        (a) =>
          a.request_number.toLowerCase().includes(s) ||
          a.school?.name.toLowerCase().includes(s) ||
          a.order?.order_number.toLowerCase().includes(s) ||
          a.student?.student_name.toLowerCase().includes(s) ||
          a.student?.admission_number.toLowerCase().includes(s)
      );
    }

    const totalCount = count || finalAlterations.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      success: true,
      alterations: finalAlterations,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error("Error in getAdminAlterationsList:", err);
    return {
      success: false,
      alterations: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      error: "Unable to load alteration requests. Please try again.",
    };
  }
}

/**
 * 3. Fetch Admin Alteration Details
 */
export async function getAdminAlterationDetails(id: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: alteration, error } = await supabase
      .from("alteration_requests")
      .select(`
        id, request_number, status, item_name, item_type, issue_type, quantity,
        current_size, required_size, remarks, description, proof_photo_url, created_at,
        rejection_reason, rework_remarks, completed_remarks, admin_note,
        schools (id, name, school_code),
        orders (id, order_number, created_at, delivered_at),
        students (id, student_name, admission_number, class_name, section, gender),
        alteration_request_history (id, status, note, created_at)
      `)
      .eq("id", id)
      .single();

    if (error || !alteration) {
      return { success: false, alteration: null, error: "Alteration request not found." };
    }

    const student = Array.isArray(alteration.students) ? alteration.students[0] : alteration.students;
    const order = Array.isArray(alteration.orders) ? alteration.orders[0] : alteration.orders;
    const school = Array.isArray(alteration.schools) ? alteration.schools[0] : alteration.schools;

    let signedPhotoUrl: string | null = null;
    if (alteration.proof_photo_url) {
      const { data: storageData } = await supabase.storage
        .from("alteration-proofs")
        .createSignedUrl(alteration.proof_photo_url, 3600);
      signedPhotoUrl = storageData?.signedUrl || null;
    }

    return {
      success: true,
      alteration: {
        ...alteration,
        item_name: alteration.item_name || alteration.item_type || "Uniform Item",
        remarks: alteration.remarks || alteration.description,
        student,
        order,
        school,
        signedPhotoUrl,
        history: (alteration.alteration_request_history || []).sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      },
    };
  } catch (err) {
    console.error("Error in getAdminAlterationDetails:", err);
    return { success: false, alteration: null, error: "Unable to load alteration details." };
  }
}

/**
 * 4. Status Transitions by EvenVive Admin (Section 22, 24, 25, 26, 27)
 */
export interface UpdateAlterationStatusParams {
  id: string;
  newStatus: "under_review" | "approved" | "rejected" | "rework" | "completed";
  rejectionReason?: string;
  reworkRemarks?: string;
  completedRemarks?: string;
  adminNote?: string;
}

export async function updateAdminAlterationStatus(params: UpdateAlterationStatusParams) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // 1. Fetch current request
    const { data: current, error: fetchErr } = await supabase
      .from("alteration_requests")
      .select("id, status, request_number")
      .eq("id", params.id)
      .single();

    if (fetchErr || !current) {
      return { success: false, error: "Alteration request not found." };
    }

    const currentStatus = current.status;
    const targetStatus = params.newStatus;

    // 2. Strict status workflow enforcement (Section 22)
    // Allowed transitions:
    // requested -> under_review
    // requested -> rejected (direct rejection allowed)
    // under_review -> approved
    // under_review -> rejected
    // approved -> rework
    // rework -> completed
    const allowedTransitions: Record<string, string[]> = {
      requested: ["under_review", "rejected"],
      under_review: ["approved", "rejected"],
      approved: ["rework"],
      rework: ["completed"],
    };

    const validTargets = allowedTransitions[currentStatus] || [];
    if (!validTargets.includes(targetStatus)) {
      return {
        success: false,
        error: `Cannot transition status from "${currentStatus.replace('_', ' ')}" to "${targetStatus.replace('_', ' ')}".`,
      };
    }

    // 3. Rejection validation (Section 26: Mandatory rejection reason)
    if (targetStatus === "rejected") {
      if (!params.rejectionReason || params.rejectionReason.trim() === "") {
        return { success: false, error: "A rejection reason is mandatory when rejecting a request." };
      }
    }

    // 4. Prepare updates
    const updateData: Record<string, unknown> = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    let historyNote = "";

    if (targetStatus === "under_review") {
      historyNote = params.adminNote?.trim() || "Moved to under review by EvenVive Admin";
      if (params.adminNote) updateData.admin_note = params.adminNote.trim();
    } else if (targetStatus === "approved") {
      historyNote = params.adminNote?.trim() || "Approved for rework by EvenVive Admin";
      if (params.adminNote) updateData.admin_note = params.adminNote.trim();
    } else if (targetStatus === "rejected") {
      const reason = params.rejectionReason!.trim();
      updateData.rejection_reason = reason;
      updateData.resolved_at = new Date().toISOString();
      historyNote = `Rejected: ${reason}`;
    } else if (targetStatus === "rework") {
      const remarks = params.reworkRemarks?.trim() || null;
      if (remarks) updateData.rework_remarks = remarks;
      historyNote = remarks ? `Rework started: ${remarks}` : "Rework in progress";
    } else if (targetStatus === "completed") {
      const remarks = params.completedRemarks?.trim() || null;
      if (remarks) updateData.completed_remarks = remarks;
      updateData.resolved_at = new Date().toISOString();
      historyNote = remarks ? `Completed: ${remarks}` : "Alteration rework completed";
    }

    // 5. Update alteration_requests
    const { error: updateErr } = await supabase
      .from("alteration_requests")
      .update(updateData)
      .eq("id", params.id);

    if (updateErr) {
      console.error("Error updating alteration status:", updateErr);
      return { success: false, error: "Unable to update alteration request. Please try again." };
    }

    // 6. Record in alteration_request_history
    await supabase.from("alteration_request_history").insert({
      alteration_request_id: params.id,
      status: targetStatus,
      note: historyNote,
    });

    revalidatePath("/admin/alterations");
    revalidatePath("/school/alterations");

    return {
      success: true,
      message: `Alteration request ${current.request_number} updated to ${targetStatus.replace('_', ' ')}.`,
    };
  } catch (err) {
    console.error("Error in updateAdminAlterationStatus:", err);
    return { success: false, error: "Unable to update alteration request. Please try again." };
  }
}

/**
 * 5. Fetch schools list for filter dropdown
 */
export async function getAdminSchoolsList() {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: schools, error } = await supabase
      .from("schools")
      .select("id, name, school_code")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching schools for filter:", error);
      return { success: false, schools: [] };
    }

    return { success: true, schools: schools || [] };
  } catch (err) {
    console.error("Error in getAdminSchoolsList:", err);
    return { success: false, schools: [] };
  }
}
