"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { createAdminNotification } from "@/lib/notifications/adminNotifications";
import {
  newAlterationSchema,
  NewAlterationFormValues,
} from "./schema";
import { isPositiveWholeNumber } from "@/lib/constants/studentSizes";
import * as XLSX from "xlsx";

export interface AlterationsSummaryData {
  total: number;
  requested: number;
  under_review: number;
  approved_rework: number;
  completed: number;
  rejected: number;
}

export interface AlterationListItem {
  id: string;
  request_number: string;
  status: string;
  item_name: string;
  style_name?: string | null;
  color?: string | null;
  issue_type: string;
  quantity: number;
  current_size: string | null;
  required_size: string | null;
  given_size?: string | null;
  change_size?: string | null;
  attempt_number?: number;
  remarks: string | null;
  proof_photo_url: string | null;
  created_at: string;
  rejection_reason: string | null;
  rework_remarks: string | null;
  completed_remarks: string | null;
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

export interface DeliveredStudent {
  id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string;
  gender: string;
  delivered_items_count: number;
  alteration_status: "Available" | "In Progress" | "Completed" | "Locked";
  attempts_summary: string;
}

export interface DeliveredStudentItemAttempt {
  attempt_number: number;
  given_size: string;
  change_size: string;
  status: string;
  created_at: string;
  request_number: string;
}

export interface DeliveredStudentItem {
  id: string;
  itemName: string;
  styleName: string;
  color: string;
  originalDeliveredSize: string;
  currentGivenSize: string;
  attemptsUsed: number;
  attemptsLabel: string;
  remainingAttempts: number;
  isLocked: boolean;
  history: DeliveredStudentItemAttempt[];
  availableSizes: string[];
}

/**
 * 1. Summary Cards for School Admin
 */
export async function getSchoolAlterationsSummary(): Promise<{
  success: boolean;
  summary: AlterationsSummaryData;
  error?: string;
}> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("alteration_requests")
      .select("status")
      .eq("school_id", profile.school_id);

    if (error) {
      console.error("Error fetching summary:", error);
      return {
        success: false,
        summary: { total: 0, requested: 0, under_review: 0, approved_rework: 0, completed: 0, rejected: 0 },
        error: "Unable to load alteration requests. Please try again.",
      };
    }

    const summary: AlterationsSummaryData = {
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
    console.error("Error in getSchoolAlterationsSummary:", err);
    return {
      success: false,
      summary: { total: 0, requested: 0, under_review: 0, approved_rework: 0, completed: 0, rejected: 0 },
      error: "Unable to load alteration requests. Please try again.",
    };
  }
}

/**
 * 2. Paginated, Filtered, Searched Requests List for School Admin
 */
export interface SchoolAlterationsFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  reason?: string;
  dateRange?: "all" | "today" | "last_7_days" | "last_30_days" | "this_month";
}

export async function getSchoolAlterationsList(params: SchoolAlterationsFilterParams) {
  try {
    const profile = await requireSchoolAdmin();
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
        current_size, required_size, given_size, change_size, attempt_number, style_name, color,
        remarks, description, proof_photo_url, created_at,
        rejection_reason, rework_remarks, completed_remarks,
        orders (id, order_number, created_at, delivered_at),
        students (id, student_name, admission_number, class_name, section, gender)
      `,
        { count: "exact" }
      )
      .eq("school_id", profile.school_id);

    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.reason && params.reason !== "all") {
      query = query.eq("issue_type", params.reason);
    }

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

    if (params.search && params.search.trim()) {
      const term = params.search.trim();
      query = query.or(
        `request_number.ilike.%${term}%,item_name.ilike.%${term}%,current_size.ilike.%${term}%,required_size.ilike.%${term}%`
      );
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching alterations list:", error);
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

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    const finalAlterations: AlterationListItem[] = (data || []).map((row) => ({
      id: row.id,
      request_number: row.request_number,
      status: row.status,
      item_name: row.item_name || row.item_type || "Uniform Item",
      style_name: row.style_name,
      color: row.color,
      issue_type: row.issue_type,
      quantity: row.quantity,
      current_size: row.given_size || row.current_size,
      required_size: row.change_size || row.required_size,
      given_size: row.given_size || row.current_size,
      change_size: row.change_size || row.required_size,
      attempt_number: row.attempt_number || 1,
      remarks: row.remarks || row.description,
      proof_photo_url: row.proof_photo_url,
      created_at: row.created_at,
      rejection_reason: row.rejection_reason,
      rework_remarks: row.rework_remarks,
      completed_remarks: row.completed_remarks,
      order: Array.isArray(row.orders) ? row.orders[0] : row.orders,
      student: Array.isArray(row.students) ? row.students[0] : row.students,
    }));

    return {
      success: true,
      alterations: finalAlterations,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error("Error in getSchoolAlterationsList:", err);
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
 * 3. Fetch Delivered Orders for authenticated School
 */
export async function getDeliveredOrdersForSchool() {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // Fetch orders that are delivered or have reached final delivery stage
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, created_at, delivered_at, requirement_id, status")
      .eq("school_id", profile.school_id)
      .in("status", ["delivered", "dispatched", "in_transit", "packed"])
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching delivered orders:", error);
      return { success: false, orders: [], error: "Unable to load delivered orders. Please try again." };
    }

    return {
      success: true,
      orders: (orders || []).map((o) => ({
        id: o.id,
        order_number: o.order_number,
        created_at: o.created_at,
        delivered_at: o.delivered_at,
        requirement_id: o.requirement_id,
        status: o.status,
      })),
    };
  } catch (err) {
    console.error("Error in getDeliveredOrdersForSchool:", err);
    return { success: false, orders: [], error: "Unable to load delivered orders. Please try again." };
  }
}


/**
 * 4. Fetch Delivery-Received Students for a Selected Order
 * CRITICAL RULE: ONLY students who actually received at least one delivered uniform item
 * in the final delivery for the selected order appear here.
 */
export async function getDeliveredStudentsForOrder(orderId: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Verify order belongs to this school
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id, requirement_id, status")
      .eq("id", orderId)
      .eq("school_id", profile.school_id)
      .single();

    if (orderErr || !order) {
      return { success: false, deliveredStudents: [], classes: [], error: "Delivered order not found." };
    }

    // 2. Fetch authoritative final delivery student items from order_delivery_student_items
    let { data: delStudentItems } = await supabase
      .from("order_delivery_student_items")
      .select(`
        id,
        student_id,
        item_name,
        style_id,
        style_name,
        color,
        size,
        quantity,
        students (
          id,
          student_name,
          admission_number,
          class_name,
          section,
          gender,
          school_id
        )
      `)
      .eq("order_id", order.id)
      .eq("school_id", profile.school_id);

    // If empty, trigger synchronization to ensure existing delivered orders are mapped
    if (!delStudentItems || delStudentItems.length === 0) {
      try {
        await supabase.rpc("sync_order_delivery_student_items", { p_order_id: order.id });
        const retryRes = await supabase
          .from("order_delivery_student_items")
          .select(`
            id,
            student_id,
            item_name,
            style_id,
            style_name,
            color,
            size,
            quantity,
            students (
              id,
              student_name,
              admission_number,
              class_name,
              section,
              gender,
              school_id
            )
          `)
          .eq("order_id", order.id)
          .eq("school_id", profile.school_id);
        delStudentItems = retryRes.data || [];
      } catch (syncErr) {
        console.warn("sync_order_delivery_student_items retry note:", syncErr);
      }
    }

    if (!delStudentItems || delStudentItems.length === 0) {
      return {
        success: true,
        deliveredStudents: [],
        classes: [],
        message: "No delivered students are available for alteration.",
      };
    }

    // Group items by student_id
    const studentMap = new Map<
      string,
      {
        student: {
          id: string;
          student_name: string;
          admission_number: string | null;
          class_name: string | null;
          section: string | null;
          gender: string | null;
        };
        items: typeof delStudentItems;
      }
    >();

    for (const item of delStudentItems) {
      const student = Array.isArray(item.students) ? item.students[0] : item.students;
      if (!student) continue;

      if (!studentMap.has(item.student_id)) {
        studentMap.set(item.student_id, {
          student,
          items: [],
        });
      }
      studentMap.get(item.student_id)!.items.push(item);
    }

    const studentIds = Array.from(studentMap.keys());
    if (studentIds.length === 0) {
      return {
        success: true,
        deliveredStudents: [],
        classes: [],
        message: "No delivered students are available for alteration.",
      };
    }

    // Fetch existing alterations for these students in this order
    const { data: existingAlts } = await supabase
      .from("alteration_requests")
      .select("id, student_id, item_name, style_name, color, attempt_number, status")
      .eq("order_id", orderId)
      .in("student_id", studentIds);

    const alterationsList = existingAlts || [];
    const deliveredStudentsList: DeliveredStudent[] = [];
    const deliveredClassesSet = new Set<string>();

    for (const [studentId, entry] of studentMap.entries()) {
      const { student, items } = entry;
      const studentAlts = alterationsList.filter((a) => a.student_id === studentId);
      const totalAttemptsMade = studentAlts.length;
      const totalDelivered = items.length;
      const maxPossibleAttempts = totalDelivered * 2;

      let statusText: "Available" | "In Progress" | "Completed" | "Locked" = "Available";
      if (totalAttemptsMade >= maxPossibleAttempts) {
        statusText = "Locked";
      } else if (studentAlts.some((a) => ["requested", "under_review", "approved", "rework"].includes(a.status))) {
        statusText = "In Progress";
      } else if (totalAttemptsMade > 0) {
        statusText = "Completed";
      }

      deliveredStudentsList.push({
        id: student.id,
        student_name: student.student_name,
        admission_number: student.admission_number || "-",
        class_name: student.class_name || "General",
        section: student.section || "-",
        gender: student.gender || "-",
        delivered_items_count: totalDelivered,
        alteration_status: statusText,
        attempts_summary: `${totalAttemptsMade}/${maxPossibleAttempts}`,
      });

      if (student.class_name) {
        deliveredClassesSet.add(student.class_name);
      }
    }

    // Sort classes naturally
    const sortedClasses = Array.from(deliveredClassesSet).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    deliveredStudentsList.sort((a, b) => a.student_name.localeCompare(b.student_name));

    return {
      success: true,
      deliveredStudents: deliveredStudentsList,
      classes: sortedClasses,
      message:
        deliveredStudentsList.length === 0
          ? "No delivered students are available for alteration."
          : undefined,
    };
  } catch (err) {
    console.error("Error in getDeliveredStudentsForOrder:", err);
    return { success: false, deliveredStudents: [], classes: [], error: "Unable to load delivered students." };
  }
}

/**
 * 5. Fetch Delivered Uniform Items for a Specific Student in an Order
 * Shows ONLY items that were actually delivered to this student.
 * Populates authoritative Given Size and calculates attempts per item.
 */
export async function getDeliveredStudentItems(orderId: string, studentId: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Verify order belongs to school
    const { data: order } = await supabase
      .from("orders")
      .select("id, school_id")
      .eq("id", orderId)
      .eq("school_id", profile.school_id)
      .single();

    if (!order) {
      return { success: false, items: [], error: "Order details unavailable." };
    }

    // 2. Verify student belongs to school
    const { data: student } = await supabase
      .from("students")
      .select("id, student_name, admission_number, class_name, section, gender")
      .eq("id", studentId)
      .eq("school_id", profile.school_id)
      .single();

    if (!student) {
      return { success: false, items: [], error: "Student not found." };
    }

    // 3. Fetch delivered items for this student from order_delivery_student_items
    let { data: delItems } = await supabase
      .from("order_delivery_student_items")
      .select("id, item_name, style_id, style_name, color, size, quantity")
      .eq("order_id", orderId)
      .eq("student_id", studentId)
      .eq("school_id", profile.school_id);

    if (!delItems || delItems.length === 0) {
      try {
        await supabase.rpc("sync_order_delivery_student_items", { p_order_id: orderId });
        const retryRes = await supabase
          .from("order_delivery_student_items")
          .select("id, item_name, style_id, style_name, color, size, quantity")
          .eq("order_id", orderId)
          .eq("student_id", studentId)
          .eq("school_id", profile.school_id);
        delItems = retryRes.data || [];
      } catch (syncErr) {
        console.warn("sync note in getDeliveredStudentItems:", syncErr);
      }
    }

    if (!delItems || delItems.length === 0) {
      return {
        success: false,
        student,
        items: [],
        error: "No delivered uniform items are available for alteration.",
      };
    }

    // 4. Fetch uniform styles and existing alterations
    const [stylesRes, existingAltsRes] = await Promise.all([
      supabase
        .from("uniform_styles")
        .select("id, item_name, style_name, available_sizes")
        .eq("school_id", profile.school_id),
      supabase
        .from("alteration_requests")
        .select("id, request_number, item_name, style_name, color, given_size, change_size, current_size, required_size, attempt_number, status, created_at")
        .eq("order_id", orderId)
        .eq("student_id", studentId)
        .order("attempt_number", { ascending: true }),
    ]);

    const styleInfoMap = new Map((stylesRes.data || []).map((st) => [st.id, st]));
    const existingAlterations = existingAltsRes.data || [];

    const deliveredItemsList: DeliveredStudentItem[] = [];

    for (const del of delItems) {
      // Find alterations for this student + item
      const itemAlts = existingAlterations.filter(
        (a) => a.item_name.toLowerCase() === del.item_name.toLowerCase()
      );

      const attemptsUsed = itemAlts.length;
      const isLocked = attemptsUsed >= 2;
      const remainingAttempts = Math.max(0, 2 - attemptsUsed);

      // RULE 22: Authoritative Given Size
      // Attempt 1: original delivered size
      // Attempt 2: change size from Attempt 1
      let authoritativeGivenSize = del.size.trim();
      if (attemptsUsed === 1 && itemAlts[0]?.change_size) {
        authoritativeGivenSize = itemAlts[0].change_size.trim();
      } else if (attemptsUsed >= 2) {
        const last = itemAlts[itemAlts.length - 1];
        authoritativeGivenSize = (last.change_size || last.required_size || del.size).trim();
      }

      // Resolve available sizes
      let availableSizes = [
        "18", "20", "22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44", "46"
      ];
      if (del.style_id && styleInfoMap.has(del.style_id)) {
        const master = styleInfoMap.get(del.style_id);
        if (master?.available_sizes && master.available_sizes.length > 0) {
          availableSizes = master.available_sizes;
        }
      }

      const history: DeliveredStudentItemAttempt[] = itemAlts.map((a) => ({
        attempt_number: a.attempt_number || 1,
        given_size: a.given_size || a.current_size || authoritativeGivenSize,
        change_size: a.change_size || a.required_size || "",
        status: a.status,
        created_at: a.created_at,
        request_number: a.request_number,
      }));

      deliveredItemsList.push({
        id: del.id,
        itemName: del.item_name,
        styleName: del.style_name || "Standard",
        color: del.color || "Default",
        originalDeliveredSize: del.size.trim(),
        currentGivenSize: authoritativeGivenSize,
        attemptsUsed,
        attemptsLabel: `${attemptsUsed}/2`,
        remainingAttempts,
        isLocked,
        history,
        availableSizes,
      });
    }

    return {
      success: true,
      student,
      items: deliveredItemsList,
    };
  } catch (err) {
    console.error("Error in getDeliveredStudentItems:", err);
    return { success: false, items: [], error: "Unable to load items for this student." };
  }
}

/**
 * 6. Submit Alteration Request
 * ENFORCES:
 * 1. Maximum 2 attempts per Student + per Item per Order.
 * 2. Authoritative Given Size derived server-side.
 * 3. Change Size validated whole number.
 * 4. School isolation enforced.
 */
export async function submitAlterationRequest(data: NewAlterationFormValues) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Zod Validation
    const parsed = newAlterationSchema.safeParse(data);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return { success: false, error: firstIssue?.message || "Invalid form data" };
    }

    const val = parsed.data;
    const finalChangeSize = (val.changeSize || val.requiredSize || "").trim();

    if (!finalChangeSize) {
      return { success: false, error: "Please enter a valid change size." };
    }

    if (!isPositiveWholeNumber(finalChangeSize)) {
      return { success: false, error: "Change size must be a valid positive whole number (e.g. 18, 20, 32, 48)." };
    }

    // 2. Validate delivered order ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id, requirement_id, status, order_number")
      .eq("id", val.orderId)
      .eq("school_id", profile.school_id)
      .single();

    if (orderErr || !order) {
      return { success: false, error: "Delivered order not found or does not belong to your school." };
    }

    if (!order.requirement_id) {
      return { success: false, error: "Student-level alteration details are not available for this previous order." };
    }

    // 3. Validate student belongs to order & school
    const { data: student } = await supabase
      .from("students")
      .select("id, student_name, class_name, gender")
      .eq("id", val.studentId)
      .eq("school_id", profile.school_id)
      .single();

    if (!student) {
      return { success: false, error: "The selected student is not eligible for alteration." };
    }

    const { data: participation } = await supabase
      .from("requirement_students")
      .select("id")
      .eq("requirement_id", order.requirement_id)
      .eq("student_id", val.studentId)
      .maybeSingle();

    if (!participation) {
      return { success: false, error: "The selected student is not eligible for alteration." };
    }

    // 4. Validate item was delivered to student from authoritative order_delivery_student_items
    let { data: delItemRecord } = await supabase
      .from("order_delivery_student_items")
      .select("id, item_name, style_name, color, size, quantity")
      .eq("order_id", val.orderId)
      .eq("student_id", val.studentId)
      .ilike("item_name", val.itemName.trim())
      .maybeSingle();

    if (!delItemRecord) {
      try {
        await supabase.rpc("sync_order_delivery_student_items", { p_order_id: val.orderId });
        const retry = await supabase
          .from("order_delivery_student_items")
          .select("id, item_name, style_name, color, size, quantity")
          .eq("order_id", val.orderId)
          .eq("student_id", val.studentId)
          .ilike("item_name", val.itemName.trim())
          .maybeSingle();
        delItemRecord = retry.data;
      } catch (syncErr) {
        console.warn("sync note in submitAlterationRequest:", syncErr);
      }
    }

    if (!delItemRecord) {
      return { success: false, error: "The selected item was not delivered to this student." };
    }

    const originalDeliveredSize = delItemRecord.size.trim();
    const resolvedStyleName = delItemRecord.style_name || val.styleName || "Standard";
    const resolvedColor = delItemRecord.color || val.color || "Default";

    // 5. SERVER-SIDE ATTEMPT LIMIT: Maximum 2 alteration attempts per Student + per Item per Order
    const { data: existingAttempts, error: countErr } = await supabase
      .from("alteration_requests")
      .select("id, request_number, attempt_number, given_size, change_size, current_size, required_size, created_at")
      .eq("order_id", val.orderId)
      .eq("student_id", val.studentId)
      .ilike("item_name", val.itemName.trim())
      .order("attempt_number", { ascending: true });

    if (countErr) {
      console.error("Error counting existing attempts:", countErr);
      return { success: false, error: "Unable to verify alteration limits. Please try again." };
    }

    const currentAttemptCount = existingAttempts?.length || 0;
    if (currentAttemptCount >= 2) {
      return {
        success: false,
        error: "This item has already reached the maximum of 2 alteration attempts.",
      };
    }

    // RULE 22: Determine Authoritative Given Size
    let authoritativeGivenSize = originalDeliveredSize;
    if (currentAttemptCount === 1) {
      // Second attempt uses change size from attempt 1
      const prev = existingAttempts[0];
      authoritativeGivenSize = prev.change_size || prev.required_size || originalDeliveredSize;
    }

    if (finalChangeSize === authoritativeGivenSize) {
      return {
        success: false,
        error: `Change size (${finalChangeSize}) cannot be the same as the current given size (${authoritativeGivenSize}).`,
      };
    }

    const attemptNumber = currentAttemptCount + 1;

    // 6. Generate collision-safe request number: EV-ALT-YYYY-XXXXXX
    const currentYear = new Date().getFullYear();
    let requestNumber = "";
    let isUnique = false;
    let retries = 0;

    while (!isUnique && retries < 10) {
      retries++;
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      requestNumber = `EV-ALT-${currentYear}-${rand}`;

      const { data: existingNum } = await supabase
        .from("alteration_requests")
        .select("id")
        .eq("request_number", requestNumber)
        .maybeSingle();

      if (!existingNum) isUnique = true;
    }

    if (!isUnique) {
      requestNumber = `EV-ALT-${currentYear}-${Date.now().toString().slice(-6)}`;
    }

    // 7. Insert Alteration Request (atomic DB constraint prevents >2)
    const { data: insertedRequest, error: insertErr } = await supabase
      .from("alteration_requests")
      .insert({
        school_id: profile.school_id,
        student_id: val.studentId,
        order_id: val.orderId,
        requirement_id: order.requirement_id,
        request_number: requestNumber,
        item_name: val.itemName.trim(),
        item_type: val.itemName.toLowerCase().trim(),
        style_name: resolvedStyleName,
        color: resolvedColor,
        given_size: authoritativeGivenSize,
        change_size: finalChangeSize,
        current_size: authoritativeGivenSize,
        required_size: finalChangeSize,
        attempt_number: attemptNumber,
        issue_type: val.reason || "Size Correction",
        description: val.remarks || val.reason || `Alteration attempt ${attemptNumber}`,
        remarks: val.remarks || null,
        proof_photo_url: val.proofPhotoUrl || null,
        quantity: 1,
        status: "requested",
        created_by: profile.id,
      })
      .select("id, request_number")
      .single();

    if (insertErr || !insertedRequest) {
      if (insertErr?.code === "23505" || insertErr?.message?.includes("chk_alteration_attempt_number") || insertErr?.message?.includes("uq_alteration_order_student_item_attempt_idx")) {
        return {
          success: false,
          error: "This item has already reached the maximum of 2 alteration attempts.",
        };
      }
      console.error("Error inserting alteration request:", insertErr);
      return { success: false, error: "Unable to submit alteration request. Please try again." };
    }

    // 8. Insert initial history row
    await supabase.from("alteration_request_history").insert({
      alteration_request_id: insertedRequest.id,
      status: "requested",
      note: `Alteration Attempt ${attemptNumber}/2 submitted: Given Size ${authoritativeGivenSize} -> Change Size ${finalChangeSize}`,
    });

    // 9. Create automatic Admin notification
    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", profile.school_id)
      .single();
    const schoolName = school?.name || "School";
    const nowIso = new Date().toISOString();

    try {
      await createAdminNotification({
        eventType: "NEW_ALTERATION_REQUEST",
        title: "New Alteration Request",
        message: `New alteration request from ${schoolName} for ${student.student_name}.`,
        link: "/admin/alterations",
        schoolId: profile.school_id,
        entityId: insertedRequest.id,
        idempotencyKey: `NEW_ALTERATION_REQUEST_${insertedRequest.id}`,
        notificationType: "alteration",
        metadata: {
          alteration_id: insertedRequest.id,
          order_id: val.orderId,
          school_id: profile.school_id,
          school_name: schoolName,
          student_id: student.id,
          student_name: student.student_name,
          item: val.itemName.trim(),
          event_type: "NEW_ALTERATION_REQUEST",
          created_at: nowIso,
        },
      });
    } catch (notifErr) {
      console.warn("Failed to create admin notification for alteration request:", notifErr);
    }

    revalidatePath("/school/alterations");
    revalidatePath(`/school/alterations/${insertedRequest.id}`);
    revalidatePath("/admin/alterations");

    return {
      success: true,
      message: `Alteration request submitted successfully (Attempt ${attemptNumber} of 2).`,
      requestId: insertedRequest.id,
      requestNumber: insertedRequest.request_number,
      attemptNumber,
    };
  } catch (err) {
    console.error("Error in submitAlterationRequest:", err);
    return { success: false, error: "Unable to submit alteration request. Please try again." };
  }
}

/**
 * 7. Photo Upload for Alteration Proof
 */
export async function uploadAlterationProof(formData: FormData) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No photo file provided." };
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: "Only JPG, PNG, and WebP images are allowed." };
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return { success: false, error: "Photo file size cannot exceed 5MB." };
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const storagePath = `schools/${profile.school_id}/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("alteration-proofs")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return { success: false, error: "Unable to upload proof photo. Please try again." };
    }

    return { success: true, storagePath };
  } catch (err) {
    console.error("Error in uploadAlterationProof:", err);
    return { success: false, error: "Unable to upload proof photo. Please try again." };
  }
}

/**
 * 8. Fetch Signed URL for Proof Photo
 */
export async function getAlterationProofSignedUrl(storagePath: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    if (!storagePath.startsWith(`schools/${profile.school_id}/`)) {
      return { success: false, error: "Unauthorized access to photo." };
    }

    const { data, error } = await supabase.storage
      .from("alteration-proofs")
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      console.error("Error creating signed URL:", error);
      return { success: false, error: "Unable to load proof photo." };
    }

    return { success: true, signedUrl: data.signedUrl };
  } catch (err) {
    console.error("Error in getAlterationProofSignedUrl:", err);
    return { success: false, error: "Unable to load proof photo." };
  }
}

/**
 * 9. Fetch Single Alteration Details for School Admin
 */
export async function getSchoolAlterationDetails(id: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { data: alteration, error } = await supabase
      .from("alteration_requests")
      .select(`
        id, request_number, status, item_name, item_type, style_name, color, issue_type, quantity,
        current_size, required_size, given_size, change_size, attempt_number,
        remarks, description, proof_photo_url, created_at,
        rejection_reason, rework_remarks, completed_remarks,
        orders (id, order_number, created_at, delivered_at),
        students (id, student_name, admission_number, class_name, section, gender),
        alteration_request_history (id, status, note, created_at)
      `)
      .eq("id", id)
      .eq("school_id", profile.school_id)
      .single();

    if (error || !alteration) {
      return { success: false, alteration: null, error: "Alteration request not found." };
    }

    const student = Array.isArray(alteration.students) ? alteration.students[0] : alteration.students;
    const order = Array.isArray(alteration.orders) ? alteration.orders[0] : alteration.orders;

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
        current_size: alteration.given_size || alteration.current_size,
        required_size: alteration.change_size || alteration.required_size,
        given_size: alteration.given_size || alteration.current_size,
        change_size: alteration.change_size || alteration.required_size,
        attempt_number: alteration.attempt_number || 1,
        student,
        order,
        signedPhotoUrl,
        history: (alteration.alteration_request_history || []).sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      },
    };
  } catch (err) {
    console.error("Error in getSchoolAlterationDetails:", err);
    return { success: false, alteration: null, error: "Unable to load alteration details." };
  }
}

/**
 * 10. Export School Alteration Requests to Excel
 */
export async function exportSchoolAlterationsToExcel() {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("alteration_requests")
      .select(`
        request_number, status, item_name, style_name, color,
        given_size, change_size, current_size, required_size, attempt_number,
        issue_type, remarks, created_at,
        orders (order_number),
        students (student_name, admission_number, class_name, section)
      `)
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: "Failed to fetch alteration records for export." };
    }

    const rows = (data || []).map((r) => {
      const ord = Array.isArray(r.orders) ? r.orders[0] : r.orders;
      const stu = Array.isArray(r.students) ? r.students[0] : r.students;
      return {
        "Request Number": r.request_number,
        "Order Number": ord?.order_number || "N/A",
        "Student Name": stu?.student_name || "N/A",
        "Admission Number": stu?.admission_number || "N/A",
        "Class": stu?.class_name || "N/A",
        "Section": stu?.section || "N/A",
        "Item": r.item_name,
        "Style": r.style_name || "Standard",
        "Color": r.color || "Default",
        "Given Size": r.given_size || r.current_size || "N/A",
        "Change Size": r.change_size || r.required_size || "N/A",
        "Attempt Number": r.attempt_number || 1,
        "Status": r.status,
        "Reason": r.issue_type,
        "Remarks": r.remarks || "",
        "Created Date": new Date(r.created_at).toLocaleString("en-IN"),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alterations");

    const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
    return { success: true, base64, filename: `Alterations_${profile.school_id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.xlsx` };
  } catch (err) {
    console.error("Error in exportSchoolAlterationsToExcel:", err);
    return { success: false, error: "Unable to export alterations." };
  }
}
