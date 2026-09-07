"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import * as XLSX from "xlsx";

export type ReportFilters = {
  className?: string;
  section?: string;
  uniformType?: string;
  orderStatus?: string;
  alterationStatus?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
};

export type OverviewReport = {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  completedSizes: number;
  pendingSizes: number;
  completionPercentage: number;
  currentRequirement: {
    id: string;
    status: string;
    requirement_number: string;
    submitted_at: string | null;
  } | null;
  currentOrder: {
    id: string;
    status: string;
    order_number: string;
  } | null;
  totalAlterations: number;
};

export type ClassSectionItem = {
  className: string;
  section: string;
  totalCount: number;
  completedSizes: number;
  pendingSizes: number;
  regularCount: number;
  tshirtCount: number;
};

export type SizeSummary = {
  regular: {
    shirt: Record<string, number>;
    pant: Record<string, number>;
    short: Record<string, number>;
  };
  tshirt: {
    tshirt: Record<string, number>;
    pant: Record<string, number>;
    short: Record<string, number>;
  };
};

export type PendingSizeStudent = {
  id: string;
  name: string;
  class_name: string;
  section: string;
  roll_number: string;
  uniform_type: string;
  missingItems: string;
};

export type RequirementItemRecord = {
  id: string;
  uniform_type: string;
  item_type: string;
  size: string;
  quantity: number;
};

export type RequirementReportItem = {
  id: string;
  requirement_number: string;
  status: string;
  total_students: number;
  regular_uniform_students: number;
  tshirt_uniform_students: number;
  submitted_at: string | null;
  created_at: string;
  requirement_items: RequirementItemRecord[];
};

export type OrderHistoryItem = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
};

export type OrderReportItem = {
  id: string;
  order_number: string;
  requirement_number: string;
  status: string;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  history: OrderHistoryItem[];
};

export type AlterationHistoryItem = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
};

export type AlterationReportItem = {
  id: string;
  request_number: string;
  student_name: string;
  class_name: string;
  section: string;
  roll_number: string;
  order_number: string;
  uniform_type: string;
  item_type: string;
  issue_type: string;
  description: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  history: AlterationHistoryItem[];
};

// 1. Overview Summary Dataset
export async function getOverviewReport(_filters?: ReportFilters): Promise<OverviewReport> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const schoolId = profile.school_id;

  const [
    studentsRes,
    sizesRes,
    requirementsRes,
    ordersRes,
    alterationsRes
  ] = await Promise.all([
    supabase.from("students").select("id, is_active").eq("school_id", schoolId),
    supabase.from("student_uniform_sizes").select("is_complete").eq("school_id", schoolId),
    supabase.from("requirements").select("id, status, requirement_number, submitted_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("orders").select("id, status, order_number").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("alteration_requests").select("id, status").eq("school_id", schoolId),
  ]);

  const totalStudents = studentsRes.data?.length || 0;
  const activeStudents = studentsRes.data?.filter(s => s.is_active !== false).length || 0;
  const inactiveStudents = totalStudents - activeStudents;

  const completedSizes = sizesRes.data?.filter(s => s.is_complete).length || 0;
  const completionPercentage = totalStudents > 0 ? Math.round((completedSizes / totalStudents) * 100) : 0;

  const currentRequirement = requirementsRes.data || null;
  const currentOrder = ordersRes.data || null;
  const totalAlterations = alterationsRes.data?.length || 0;

  return {
    totalStudents,
    activeStudents,
    inactiveStudents,
    completedSizes,
    pendingSizes: totalStudents - completedSizes,
    completionPercentage,
    currentRequirement,
    currentOrder,
    totalAlterations,
  };
}

// 2. Class & Section Breakdown Dataset
export async function getClassSectionReport(_filters?: ReportFilters): Promise<ClassSectionItem[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select(`
      id, class_name, section, is_active,
      student_uniform_sizes (is_complete, uniform_type)
    `)
    .eq("school_id", profile.school_id);

  const breakdownMap: Record<string, ClassSectionItem> = {};

  (students || []).forEach(s => {
    const className = s.class_name || "Unassigned";
    const section = s.section || "N/A";
    const key = `${className}-${section}`;

    if (!breakdownMap[key]) {
      breakdownMap[key] = {
        className,
        section,
        totalCount: 0,
        completedSizes: 0,
        pendingSizes: 0,
        regularCount: 0,
        tshirtCount: 0,
      };
    }

    breakdownMap[key].totalCount++;
    const sizeRecord = Array.isArray(s.student_uniform_sizes) ? s.student_uniform_sizes[0] : s.student_uniform_sizes;

    if (sizeRecord?.is_complete) {
      breakdownMap[key].completedSizes++;
    } else {
      breakdownMap[key].pendingSizes++;
    }

    if (sizeRecord?.uniform_type === "regular") {
      breakdownMap[key].regularCount++;
    } else if (sizeRecord?.uniform_type === "tshirt") {
      breakdownMap[key].tshirtCount++;
    }
  });

  return Object.values(breakdownMap).sort((a, b) => 
    a.className.localeCompare(b.className, undefined, { numeric: true }) || a.section.localeCompare(b.section)
  );
}

// 3. Uniform Size Summary Dataset
export async function getUniformSizeReport(_filters?: ReportFilters): Promise<SizeSummary> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: sizes } = await supabase
    .from("student_uniform_sizes")
    .select("uniform_type, shirt_size, tshirt_size, pant_size, short_size")
    .eq("school_id", profile.school_id);

  const regularShirt: Record<string, number> = {};
  const regularPant: Record<string, number> = {};
  const regularShort: Record<string, number> = {};

  const tshirtTop: Record<string, number> = {};
  const tshirtPant: Record<string, number> = {};
  const tshirtShort: Record<string, number> = {};

  (sizes || []).forEach(s => {
    if (s.uniform_type === "regular") {
      if (s.shirt_size) regularShirt[s.shirt_size] = (regularShirt[s.shirt_size] || 0) + 1;
      if (s.pant_size) regularPant[s.pant_size] = (regularPant[s.pant_size] || 0) + 1;
      if (s.short_size) regularShort[s.short_size] = (regularShort[s.short_size] || 0) + 1;
    } else if (s.uniform_type === "tshirt") {
      if (s.tshirt_size) tshirtTop[s.tshirt_size] = (tshirtTop[s.tshirt_size] || 0) + 1;
      if (s.pant_size) tshirtPant[s.pant_size] = (tshirtPant[s.pant_size] || 0) + 1;
      if (s.short_size) tshirtShort[s.short_size] = (tshirtShort[s.short_size] || 0) + 1;
    }
  });

  return {
    regular: { shirt: regularShirt, pant: regularPant, short: regularShort },
    tshirt: { tshirt: tshirtTop, pant: tshirtPant, short: tshirtShort }
  };
}

// 4. Size Completion & Pending List Dataset
export async function getPendingSizesReport(filters?: ReportFilters): Promise<PendingSizeStudent[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("students")
    .select(`
      id, student_name, class_name, section, roll_number,
      student_uniform_sizes (id, is_complete, uniform_type, shirt_size, tshirt_size, pant_size, short_size)
    `)
    .eq("school_id", profile.school_id);

  if (filters?.className) query = query.eq("class_name", filters.className);
  if (filters?.section) query = query.eq("section", filters.section);

  const { data: students } = await query
    .order("class_name")
    .order("section")
    .order("roll_number");

  const pendingList = (students || []).filter(s => {
    const record = Array.isArray(s.student_uniform_sizes) ? s.student_uniform_sizes[0] : s.student_uniform_sizes;
    return !record?.is_complete;
  }).map(s => {
    const record = Array.isArray(s.student_uniform_sizes) ? s.student_uniform_sizes[0] : s.student_uniform_sizes;
    const missing: string[] = [];

    if (!record) {
      missing.push("All Sizes Missing");
    } else {
      if (record.uniform_type === "regular" && !record.shirt_size) missing.push("Shirt Size");
      if (record.uniform_type === "tshirt" && !record.tshirt_size) missing.push("T-Shirt Size");
      if (!record.pant_size && !record.short_size) missing.push("Pant or Short Size");
    }

    return {
      id: s.id,
      name: s.student_name,
      class_name: s.class_name,
      section: s.section,
      roll_number: s.roll_number,
      uniform_type: record?.uniform_type || "Unassigned",
      missingItems: missing.join(", "),
    };
  });

  return pendingList;
}

// 5. Requirement Snapshot Dataset
export async function getRequirementsReport(filters?: ReportFilters): Promise<RequirementReportItem[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("requirements")
    .select(`
      id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students, submitted_at, created_at,
      requirement_items (id, uniform_type, item_type, size, quantity)
    `)
    .eq("school_id", profile.school_id)
    .order("created_at", { ascending: false });

  if (filters?.searchQuery) {
    query = query.ilike("requirement_number", `%${filters.searchQuery.trim()}%`);
  }

  const { data: requirements } = await query;
  return (requirements || []) as RequirementReportItem[];
}

// 6. Order & Tracking History Dataset
export async function getOrdersReport(filters?: ReportFilters): Promise<OrderReportItem[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(`
      id, order_number, status, courier_name, tracking_number, estimated_delivery, shipped_at, delivered_at, created_at,
      requirements (requirement_number),
      order_status_history (id, status, note, created_at)
    `)
    .eq("school_id", profile.school_id);

  if (filters?.orderStatus) {
    query = query.eq("status", filters.orderStatus);
  }

  if (filters?.searchQuery) {
    query = query.ilike("order_number", `%${filters.searchQuery.trim()}%`);
  }

  const { data: orders } = await query.order("created_at", { ascending: false });

  return (orders || []).map(o => {
    const req = (Array.isArray(o.requirements) ? o.requirements[0] : o.requirements) as { requirement_number?: string } | null;
    const history = (o.order_status_history || []).sort(
      (a: OrderHistoryItem, b: OrderHistoryItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      id: o.id,
      order_number: o.order_number,
      requirement_number: req?.requirement_number || "N/A",
      status: o.status,
      courier_name: o.courier_name,
      tracking_number: o.tracking_number,
      estimated_delivery: o.estimated_delivery,
      shipped_at: o.shipped_at,
      delivered_at: o.delivered_at,
      created_at: o.created_at,
      history,
    };
  });
}

// 7. Alteration / Rework Dataset
export async function getAlterationsReport(filters?: ReportFilters): Promise<AlterationReportItem[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("alteration_requests")
    .select(`
      id, request_number, uniform_type, item_type, issue_type, description, status, admin_note, resolved_at, created_at,
      students (id, full_name, class_name, section, roll_number),
      orders (order_number),
      alteration_request_history (id, status, note, created_at)
    `)
    .eq("school_id", profile.school_id);

  if (filters?.alterationStatus) {
    query = query.eq("status", filters.alterationStatus);
  }

  if (filters?.uniformType) {
    query = query.eq("uniform_type", filters.uniformType);
  }

  if (filters?.searchQuery) {
    const trimmed = filters.searchQuery.trim();
    query = query.or(`request_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%`);
  }

  const { data: alterations } = await query.order("created_at", { ascending: false });

  return (alterations || []).map(a => {
    const student = Array.isArray(a.students) ? a.students[0] : a.students;
    const order = Array.isArray(a.orders) ? a.orders[0] : a.orders;
    const history = (a.alteration_request_history || []).sort(
      (x: AlterationHistoryItem, y: AlterationHistoryItem) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
    );

    return {
      id: a.id,
      request_number: a.request_number,
      student_name: student?.full_name || "Unnamed",
      class_name: student?.class_name || "",
      section: student?.section || "",
      roll_number: student?.roll_number || "",
      order_number: order?.order_number || "None",
      uniform_type: a.uniform_type,
      item_type: a.item_type,
      issue_type: a.issue_type,
      description: a.description,
      status: a.status,
      admin_note: a.admin_note,
      created_at: a.created_at,
      resolved_at: a.resolved_at,
      history,
    };
  });
}

// Global filter helper for School Admin options
export async function getReportFilterOptions() {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("class_name, section")
    .eq("school_id", profile.school_id);

  const classesSet = new Set<string>();
  const sectionsSet = new Set<string>();

  (students || []).forEach(s => {
    if (s.class_name) classesSet.add(s.class_name);
    if (s.section) sectionsSet.add(s.section);
  });

  return {
    classes: Array.from(classesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sections: Array.from(sectionsSet).sort(),
  };
}

// Server-side secure Excel Export action
export async function exportReportToExcel(reportType: 'students' | 'sizes' | 'requirements' | 'orders' | 'alterations', filters?: ReportFilters) {
  // Re-verify authentication & school scope
  const profile = await requireSchoolAdmin();
  if (!profile.school_id) {
    throw new Error("Unauthorized access to export.");
  }

  let exportData: Record<string, string | number>[] = [];
  let sheetName = "Report";
  const filename = `EVENVIBE_${reportType.toUpperCase()}_REPORT.xlsx`;

  if (reportType === 'students') {
    const data = await getClassSectionReport(filters);
    sheetName = "Class Breakdown";
    exportData = data.map(d => ({
      "Class": d.className,
      "Section": d.section,
      "Total Students": d.totalCount,
      "Sizes Completed": d.completedSizes,
      "Sizes Pending": d.pendingSizes,
      "Regular Uniform Count": d.regularCount,
      "T-Shirt Uniform Count": d.tshirtCount,
    }));
  } else if (reportType === 'sizes') {
    const pendingData = await getPendingSizesReport(filters);
    sheetName = "Pending Sizes";
    exportData = pendingData.map(p => ({
      "Student Name": p.name,
      "Class": p.class_name,
      "Section": p.section,
      "Roll Number": p.roll_number,
      "Uniform Type": p.uniform_type,
      "Missing Sizes": p.missingItems,
    }));
  } else if (reportType === 'requirements') {
    const reqData = await getRequirementsReport(filters);
    sheetName = "Requirements";
    exportData = reqData.map(r => ({
      "Requirement Number": r.requirement_number,
      "Status": r.status,
      "Total Students": r.total_students,
      "Regular Students": r.regular_uniform_students,
      "T-Shirt Students": r.tshirt_uniform_students,
      "Submitted At": r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "N/A",
    }));
  } else if (reportType === 'orders') {
    const orderData = await getOrdersReport(filters);
    sheetName = "Orders";
    exportData = orderData.map(o => ({
      "Order Number": o.order_number,
      "Requirement Number": o.requirement_number,
      "Current Status": o.status,
      "Courier Name": o.courier_name || "N/A",
      "Tracking Number": o.tracking_number || "N/A",
      "Estimated Delivery": o.estimated_delivery || "N/A",
      "Created At": new Date(o.created_at).toLocaleString(),
    }));
  } else if (reportType === 'alterations') {
    const altData = await getAlterationsReport(filters);
    sheetName = "Alterations";
    exportData = altData.map(a => ({
      "Request Number": a.request_number,
      "Student Name": a.student_name,
      "Class": a.class_name,
      "Section": a.section,
      "Roll Number": a.roll_number,
      "Order Number": a.order_number,
      "Uniform Type": a.uniform_type,
      "Item": a.item_type,
      "Issue": a.issue_type,
      "Status": a.status,
      "Created At": new Date(a.created_at).toLocaleString(),
    }));
  }

  // Generate Excel workbook
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

  return {
    success: true,
    filename,
    base64,
  };
}
