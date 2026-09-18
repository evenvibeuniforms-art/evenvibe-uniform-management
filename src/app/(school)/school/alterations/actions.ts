"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import {
  newAlterationSchema,
  NewAlterationFormValues,
} from "./schema";

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
        current_size, required_size, remarks, description, proof_photo_url, created_at,
        rejection_reason, rework_remarks, completed_remarks,
        orders (id, order_number, created_at, delivered_at),
        students (id, student_name, admission_number, class_name, section, gender)
      `,
        { count: "exact" }
      )
      .eq("school_id", profile.school_id);

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

    // Search filter (Request ID, Order Number, Student Name, Admission Number)
    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      query = query.or(
        `request_number.ilike.%${s}%,item_name.ilike.%${s}%`
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching school alterations list:", error);
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

    const alterations: AlterationListItem[] = (data || []).map((row) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students;
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;

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

    // Secondary client-side text filtering if search was matched against student or order
    let finalAlterations = alterations;
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      finalAlterations = alterations.filter(
        (a) =>
          a.request_number.toLowerCase().includes(s) ||
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

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, created_at, delivered_at, requirement_id")
      .eq("school_id", profile.school_id)
      .eq("status", "delivered")
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
      })),
    };
  } catch (err) {
    console.error("Error in getDeliveredOrdersForSchool:", err);
    return { success: false, orders: [], error: "Unable to load delivered orders. Please try again." };
  }
}

/**
 * 4. Fetch Historical Students belonging to a specific Delivered Order
 */
export async function getOrderStudents(orderId: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Verify order belongs to school and is delivered
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id, requirement_id, status")
      .eq("id", orderId)
      .eq("school_id", profile.school_id)
      .single();

    if (orderErr || !order) {
      return { success: false, legacy: false, students: [], error: "Order not found." };
    }

    if (order.status !== "delivered") {
      return {
        success: false,
        legacy: false,
        students: [],
        error: "Alterations can only be requested for delivered orders.",
      };
    }

    // 2. If requirement_id is missing, this is a legacy order without student tracking
    if (!order.requirement_id) {
      return {
        success: true,
        legacy: true,
        message: "Student-level alteration details are not available for this previous order.",
        students: [],
      };
    }

    // 3. Fetch requirement_students
    const { data: reqStudents, error: reqErr } = await supabase
      .from("requirement_students")
      .select(`
        student_id,
        students (id, student_name, admission_number, class_name, section, gender, school_id)
      `)
      .eq("requirement_id", order.requirement_id);

    if (reqErr) {
      console.error("Error fetching requirement students:", reqErr);
      return { success: false, legacy: false, students: [], error: "Unable to load students for this order." };
    }

    if (!reqStudents || reqStudents.length === 0) {
      return {
        success: true,
        legacy: true,
        message: "Student-level alteration details are not available for this previous order.",
        students: [],
      };
    }

    // Filter students belonging to this school
    const students = reqStudents
      .map((rs) => (Array.isArray(rs.students) ? rs.students[0] : rs.students))
      .filter((s): s is NonNullable<typeof s> => Boolean(s) && s.school_id === profile.school_id)
      .map((s) => ({
        id: s.id,
        student_name: s.student_name,
        admission_number: s.admission_number,
        class_name: s.class_name,
        section: s.section,
        gender: s.gender,
      }))
      .sort((a, b) => a.student_name.localeCompare(b.student_name));

    return {
      success: true,
      legacy: false,
      students,
    };
  } catch (err) {
    console.error("Error in getOrderStudents:", err);
    return { success: false, legacy: false, students: [], error: "Unable to load students for this order." };
  }
}

/**
 * 5. Fetch Historical Uniform Items & Sizes for a Student in an Order
 */
export interface StudentOrderItem {
  itemName: string;
  currentSize: string | null;
  maxQuantity: number;
  availableSizes: string[];
}

export async function getStudentOrderItems(orderId: string, studentId: string) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // Verify order
    const { data: order } = await supabase
      .from("orders")
      .select("id, school_id, requirement_id, status")
      .eq("id", orderId)
      .eq("school_id", profile.school_id)
      .eq("status", "delivered")
      .single();

    if (!order || !order.requirement_id) {
      return { success: false, items: [], error: "Order details unavailable." };
    }

    // Verify student participated in this requirement
    const { data: participation } = await supabase
      .from("requirement_students")
      .select("id")
      .eq("requirement_id", order.requirement_id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!participation) {
      return { success: false, items: [], error: "Student was not part of this order." };
    }

    // Fetch student profile
    const { data: student } = await supabase
      .from("students")
      .select("id, student_name, class_name, gender")
      .eq("id", studentId)
      .eq("school_id", profile.school_id)
      .single();

    if (!student) {
      return { success: false, items: [], error: "Student not found." };
    }

    // Fetch student sizes
    const { data: studentSizes } = await supabase
      .from("student_uniform_sizes")
      .select("dynamic_sizes, shirt_size, pant_size, tshirt_size, short_size, uniform_type")
      .eq("student_id", studentId)
      .maybeSingle();

    // Fetch requirement items for this requirement
    const { data: reqItems } = await supabase
      .from("requirement_items")
      .select("item_name, size, quantity, class_name, gender")
      .eq("requirement_id", order.requirement_id);

    // Fetch school uniform configuration items
    const { data: configItems } = await supabase
      .from("school_uniform_configuration_items")
      .select("id, item_name, available_sizes")
      .eq("school_id", profile.school_id);

    const items: StudentOrderItem[] = [];
    const configMap = new Map((configItems || []).map((ci) => [ci.id, ci]));

    // 1. Process dynamic sizes if available
    if (studentSizes?.dynamic_sizes && typeof studentSizes.dynamic_sizes === "object") {
      const dyn = studentSizes.dynamic_sizes as Record<string, string>;
      for (const [configId, size] of Object.entries(dyn)) {
        const configItem = configMap.get(configId);
        if (configItem && size) {
          // Find applicable max quantity from requirement items
          const matchingReq = (reqItems || []).find(
            (ri) =>
              ri.item_name?.toLowerCase() === configItem.item_name?.toLowerCase() &&
              (!ri.class_name || ri.class_name === student.class_name) &&
              (!ri.gender || ri.gender.toLowerCase() === student.gender.toLowerCase())
          );

          items.push({
            itemName: configItem.item_name,
            currentSize: size,
            maxQuantity: matchingReq?.quantity ? Math.max(1, matchingReq.quantity) : 1,
            availableSizes: configItem.available_sizes || [],
          });
        }
      }
    }

    // 2. Process standard sizes if dynamic sizes didn't populate or as supplement
    const standardFields = [
      { key: "shirt_size", name: "Shirt" },
      { key: "pant_size", name: "Pant" },
      { key: "tshirt_size", name: "T-Shirt" },
      { key: "short_size", name: "Short" },
    ] as const;

    for (const field of standardFields) {
      const sizeVal = studentSizes?.[field.key];
      if (sizeVal && !items.some((it) => it.itemName.toLowerCase() === field.name.toLowerCase())) {
        const matchingConfig = (configItems || []).find(
          (ci) => ci.item_name.toLowerCase() === field.name.toLowerCase()
        );
        const matchingReq = (reqItems || []).find(
          (ri) =>
            ri.item_name?.toLowerCase() === field.name.toLowerCase() &&
            (!ri.class_name || ri.class_name === student.class_name) &&
            (!ri.gender || ri.gender.toLowerCase() === student.gender.toLowerCase())
        );

        items.push({
          itemName: field.name,
          currentSize: sizeVal,
          maxQuantity: matchingReq?.quantity ? Math.max(1, matchingReq.quantity) : 1,
          availableSizes: matchingConfig?.available_sizes || [
            "20", "22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44",
            "XS", "S", "M", "L", "XL", "2XL", "3XL"
          ],
        });
      }
    }

    // 3. Fallback to requirement_items if student_uniform_sizes had no matching sizes
    if (items.length === 0 && reqItems && reqItems.length > 0) {
      const studentClassItems = reqItems.filter(
        (ri) =>
          (!ri.class_name || ri.class_name === student.class_name) &&
          (!ri.gender || ri.gender.toLowerCase() === student.gender.toLowerCase())
      );

      const distinctItemNames = Array.from(new Set(studentClassItems.map((ri) => ri.item_name)));
      for (const name of distinctItemNames) {
        if (!name) continue;
        const matchingReq = studentClassItems.find((ri) => ri.item_name === name);
        const matchingConfig = (configItems || []).find(
          (ci) => ci.item_name.toLowerCase() === name.toLowerCase()
        );

        items.push({
          itemName: name,
          currentSize: matchingReq?.size || null,
          maxQuantity: matchingReq?.quantity ? Math.max(1, matchingReq.quantity) : 1,
          availableSizes: matchingConfig?.available_sizes || [
            "20", "22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44",
            "XS", "S", "M", "L", "XL", "2XL", "3XL"
          ],
        });
      }
    }

    return { success: true, items };
  } catch (err) {
    console.error("Error in getStudentOrderItems:", err);
    return { success: false, items: [], error: "Unable to load items for this student." };
  }
}

/**
 * 6. Submit Alteration Request
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

    // 2. Validate delivered order ownership and status
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, school_id, requirement_id, status, order_number")
      .eq("id", val.orderId)
      .eq("school_id", profile.school_id)
      .single();

    if (orderErr || !order) {
      return { success: false, error: "Delivered order not found or does not belong to your school." };
    }

    if (order.status !== "delivered") {
      return { success: false, error: "Alteration requests are permitted only for delivered orders." };
    }

    // 3. Validate student belongs to order & school
    if (!order.requirement_id) {
      return { success: false, error: "Student-level alteration details are not available for this previous order." };
    }

    const { data: participation } = await supabase
      .from("requirement_students")
      .select("id")
      .eq("requirement_id", order.requirement_id)
      .eq("student_id", val.studentId)
      .maybeSingle();

    if (!participation) {
      return { success: false, error: "Selected student does not belong to this delivered order." };
    }

    // 4. Duplicate request protection (Section 31)
    // Check if there is already an active request for the same order, student, item, and reason
    const { data: existingActive } = await supabase
      .from("alteration_requests")
      .select("id, request_number")
      .eq("order_id", val.orderId)
      .eq("student_id", val.studentId)
      .eq("item_name", val.itemName)
      .eq("issue_type", val.reason)
      .in("status", ["requested", "under_review", "approved", "rework"])
      .maybeSingle();

    if (existingActive) {
      return {
        success: false,
        error: `An active alteration request (${existingActive.request_number}) is already pending for this item and issue.`,
      };
    }

    // 5. Generate collision-safe unique request number: EV-ALT-YYYY-XXXXXX
    const currentYear = new Date().getFullYear();
    let requestNumber = "";
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      attempts++;
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      requestNumber = `EV-ALT-${currentYear}-${rand}`;

      const { data: existingNum } = await supabase
        .from("alteration_requests")
        .select("id")
        .eq("request_number", requestNumber)
        .maybeSingle();

      if (!existingNum) {
        isUnique = true;
      }
    }

    if (!isUnique) {
      requestNumber = `EV-ALT-${currentYear}-${Date.now().toString().slice(-6)}`;
    }

    // 6. Insert alteration request
    const { data: insertedRequest, error: insertErr } = await supabase
      .from("alteration_requests")
      .insert({
        school_id: profile.school_id,
        student_id: val.studentId,
        order_id: val.orderId,
        requirement_id: order.requirement_id,
        request_number: requestNumber,
        item_name: val.itemName,
        item_type: val.itemName.toLowerCase(),
        issue_type: val.reason,
        description: val.remarks || val.reason,
        remarks: val.remarks || null,
        current_size: val.currentSize || null,
        required_size: val.requiredSize || null,
        quantity: val.quantity,
        proof_photo_url: val.proofPhotoUrl || null,
        status: "requested",
      })
      .select("id, request_number")
      .single();

    if (insertErr || !insertedRequest) {
      console.error("Error inserting alteration request:", insertErr);
      return { success: false, error: "Unable to submit alteration request. Please try again." };
    }

    // 7. Insert initial history row
    await supabase.from("alteration_request_history").insert({
      alteration_request_id: insertedRequest.id,
      status: "requested",
      note: "Alteration request submitted by school admin",
    });

    revalidatePath("/school/alterations");

    return {
      success: true,
      message: "Alteration request submitted successfully.",
      requestId: insertedRequest.id,
      requestNumber: insertedRequest.request_number,
    };
  } catch (err) {
    console.error("Error in submitAlterationRequest:", err);
    return { success: false, error: "Unable to submit alteration request. Please try again." };
  }
}

/**
 * 7. Upload Proof Photo
 */
export async function uploadAlterationProof(formData: FormData) {
  try {
    const profile = await requireSchoolAdmin();
    const file = formData.get("file") as File | null;

    if (!file) {
      return { success: false, error: "No file provided." };
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: "Invalid image format. Allowed: PNG, JPG, JPEG, WEBP." };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File size exceeds 5MB limit." };
    }

    const supabase = await createClient();
    const ext = file.name.split(".").pop() || "png";
    const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
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

    // Security check: School admin can only access their school's photos
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
        id, request_number, status, item_name, item_type, issue_type, quantity,
        current_size, required_size, remarks, description, proof_photo_url, created_at,
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
