
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import * as XLSX from "xlsx";

export type ReportFilters = {
  className?: string;
  section?: string;
  gender?: string;
  sizeStatus?: string; // "completed" | "pending"
  uniformType?: string;
  uniformItem?: string;
  requirementStatus?: string;
  orderStatus?: string;
  alterationStatus?: string;
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

// Gender -> ItemName -> Size -> Quantity
export type SizeSummary = Record<string, Record<string, Record<string, number>>>;

export type StudentReportItem = {
  id: string;
  student_name: string;
  class_name: string;
  section: string;
  admission_number: string;
  gender: string;
  is_active: boolean;
  is_complete: boolean;
  uniform_type: string;
  dynamic_sizes: Record<string, string>;
  shirt_size: string | null;
  tshirt_size: string | null;
  pant_size: string | null;
  short_size: string | null;
  alterations_count: number;
  missingItems: string;
};

export type PendingSizeStudent = StudentReportItem;

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
  admission_number: string;
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
  gender: string;
};

// Simple server-side request cache to prevent re-fetching uniform configurations multiple times per request lifecycle
const configCache: Record<string, { map: Record<string, { gender: string; item_name: string }>, items: Record<string, { id: string, item_name: string }[]> }> = {};

async function getSchoolConfig(schoolId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  if (configCache[schoolId]) {
    return { configMap: configCache[schoolId].map, itemsByGender: configCache[schoolId].items };
  }

  const { data: configs } = await supabase
    .from("school_uniform_configurations")
    .select(`
      gender,
      items:school_uniform_configuration_items (
        id, item_name
      )
    `)
    .eq("school_id", schoolId);

  const configMap: Record<string, { gender: string; item_name: string }> = {};
  const itemsByGender: Record<string, { id: string, item_name: string }[]> = {};

  (configs || []).forEach((conf: { gender?: string, items?: unknown }) => {
    const gender = conf.gender || "Unassigned";
    const items = (Array.isArray(conf.items) ? conf.items : [conf.items]).filter(Boolean) as { id: string, item_name: string }[];
    itemsByGender[gender] = items;
    items.forEach(item => {
      configMap[item.id] = { gender, item_name: item.item_name };
    });
  });

  configCache[schoolId] = { map: configMap, items: itemsByGender };
  return { configMap, itemsByGender };
}

// STAGE 1: Lightweight Search
export async function searchStudents(filters?: ReportFilters) {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();
  
  let query = supabase
    .from("students")
    .select("id, student_name, class_name, section, admission_number, gender, is_active")
    .eq("school_id", profile.school_id)
    .eq("is_active", true); // Strict active student rule for reports

  if (filters?.className) query = query.eq("class_name", filters.className);
  if (filters?.section) query = query.eq("section", filters.section);
  if (filters?.gender) query = query.eq("gender", filters.gender);
  
  if (filters?.searchQuery) {
    const q = `%${filters.searchQuery.trim()}%`; // CORRECT SYNTAX
    query = query.or(`student_name.ilike.${q},admission_number.ilike.${q}`);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error("Student search error:", error);
    throw new Error("Unable to load report data. Please try again.");
  }
  
  return data || [];
}

// Helper to fetch and map all matching students (TWO STAGE ARCHITECTURE)
export async function getStudentsReport(filters?: ReportFilters): Promise<StudentReportItem[]> {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();
  const schoolId = profile.school_id;

  // STAGE 1: Find IDs
  const matchedStudents = await searchStudents(filters);
  if (matchedStudents.length === 0) return [];

  const studentIds = matchedStudents.map(s => s.id);

  // STAGE 2: Fetch Details Only For Matches
  const { data: relatedData } = await supabase
    .from("students")
    .select(`
      id,
      student_uniform_sizes (id, is_complete, uniform_type, dynamic_sizes, shirt_size, tshirt_size, pant_size, short_size),
      alteration_requests (id)
    `)
    .in("id", studentIds);

  const relatedMap = new Map();
  (relatedData || []).forEach(r => relatedMap.set(r.id, r));

  const { itemsByGender } = await getSchoolConfig(schoolId, supabase);

  let mapped = matchedStudents.map(s => {
    const rel = relatedMap.get(s.id) || {};
    const record = Array.isArray(rel.student_uniform_sizes) ? rel.student_uniform_sizes[0] : rel.student_uniform_sizes;
    const dynamicSizes = record?.dynamic_sizes as Record<string, string> || {};
    const gender = s.gender || "Unassigned";

    const missing: string[] = [];
    if (!record) {
      missing.push("All Sizes Missing");
    } else {
      const configItems = itemsByGender[gender] || [];
      if (configItems.length > 0) {
        configItems.forEach(item => {
          if (!dynamicSizes[item.id]) {
            missing.push(item.item_name);
          }
        });
      } else {
        // Legacy fallback
        if (record.uniform_type === "regular" && !record.shirt_size) missing.push("Shirt Size");
        if (record.uniform_type === "tshirt" && !record.tshirt_size) missing.push("T-Shirt Size");
        if (!record.pant_size && !record.short_size) missing.push("Pant or Short Size");
      }
    }

    return {
      id: s.id,
      student_name: s.student_name,
      class_name: s.class_name,
      section: s.section,
      admission_number: s.admission_number,
      gender: s.gender || "Unassigned",
      is_active: s.is_active !== false,
      is_complete: !!record?.is_complete,
      uniform_type: record?.uniform_type || "Unassigned",
      dynamic_sizes: dynamicSizes,
      shirt_size: record?.shirt_size || null,
      tshirt_size: record?.tshirt_size || null,
      pant_size: record?.pant_size || null,
      short_size: record?.short_size || null,
      alterations_count: Array.isArray(rel.alteration_requests) ? rel.alteration_requests.length : (rel.alteration_requests ? 1 : 0),
      missingItems: missing.join(", "),
    };
  });

  if (filters?.sizeStatus) {
    const isCompleteFilter = filters.sizeStatus === "completed";
    mapped = mapped.filter(m => m.is_complete === isCompleteFilter);
  }

  mapped.sort((a, b) => {
    return (a.class_name || "").localeCompare(b.class_name || "", undefined, { numeric: true }) ||
           (a.section || "").localeCompare(b.section || "") ||
           (a.admission_number || "").localeCompare(b.admission_number || "");
  });

  return mapped;
}

// NEW OPTIMIZED FUNCTION: Returns ALL computed student-based metrics from ONE single dataset
export async function getAggregatedStudentData(filters?: ReportFilters) {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();
  const schoolId = profile.school_id;

  // Fetch exactly one filtered student dataset using the two-stage logic
  const students = await getStudentsReport(filters);

  // If error occurred (handled inside getStudentsReport), or empty
  if (!students || students.length === 0) {
    return {
      students: [],
      sizeSummary: {},
      pendingSizes: [],
      classSection: [],
      overview: {
        totalStudents: 0,
        activeStudents: 0,
        inactiveStudents: 0,
        completedSizes: 0,
        pendingSizes: 0,
        completionPercentage: 0,
        currentRequirement: null,
        currentOrder: null,
        totalAlterations: 0
      }
    };
  }

  // 2. Compute pending sizes
  const pendingSizes = students.filter(s => !s.is_complete);

  // 3. Compute class/section breakdown
  const breakdownMap: Record<string, ClassSectionItem> = {};
  students.forEach(s => {
    const className = s.class_name || "Unassigned";
    const section = s.section || "N/A";
    const key = `${className}-${section}`;

    if (!breakdownMap[key]) {
      breakdownMap[key] = { className, section, totalCount: 0, completedSizes: 0, pendingSizes: 0, regularCount: 0, tshirtCount: 0 };
    }
    breakdownMap[key].totalCount++;
    if (s.is_complete) breakdownMap[key].completedSizes++;
    else breakdownMap[key].pendingSizes++;

    if (s.uniform_type === "regular") breakdownMap[key].regularCount++;
    else if (s.uniform_type === "tshirt") breakdownMap[key].tshirtCount++;
  });
  const classSection = Object.values(breakdownMap).sort((a, b) => 
    a.className.localeCompare(b.className, undefined, { numeric: true }) || a.section.localeCompare(b.section)
  );

  // 4. Compute Size Summary
  const { configMap } = await getSchoolConfig(schoolId, supabase);
  const sizeSummary: SizeSummary = {};
  const addSize = (gender: string, itemName: string, size: string) => {
    if (!gender) gender = "Unassigned";
    if (!sizeSummary[gender]) sizeSummary[gender] = {};
    if (!sizeSummary[gender][itemName]) sizeSummary[gender][itemName] = {};
    sizeSummary[gender][itemName][size] = (sizeSummary[gender][itemName][size] || 0) + 1;
  };

  students.forEach((s) => {
    let processedLegacy = false;
    const dynamicKeys = Object.keys(s.dynamic_sizes);
    if (dynamicKeys.length > 0) {
      dynamicKeys.forEach(itemId => {
        const conf = configMap[itemId];
        const sizeValue = s.dynamic_sizes[itemId];
        if (conf && sizeValue) {
          addSize(conf.gender, conf.item_name, sizeValue);
          processedLegacy = true; 
        }
      });
    }

    if (!processedLegacy) {
      if (s.uniform_type === "regular") {
        if (s.shirt_size) addSize(s.gender, "Shirt", s.shirt_size);
        if (s.pant_size) addSize(s.gender, "Pant", s.pant_size);
        if (s.short_size) addSize(s.gender, "Short", s.short_size);
      } else if (s.uniform_type === "tshirt") {
        if (s.tshirt_size) addSize(s.gender, "T-Shirt", s.tshirt_size);
        if (s.pant_size) addSize(s.gender, "Pant", s.pant_size);
        if (s.short_size) addSize(s.gender, "Short", s.short_size);
      }
    }
  });

  // 5. Compute Overview metrics based ONLY on this matched dataset
  // Since searchStudents already applied is_active = true, students array is purely active.
  const totalS = students.length;
  const completedSizes = students.filter(s => s.is_complete).length;

  const [reqRes, ordRes] = await Promise.all([
    supabase.from("requirements").select("id, status, requirement_number, submitted_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("orders").select("id, status, order_number").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const overview: OverviewReport = {
    totalStudents: totalS,
    activeStudents: totalS,
    inactiveStudents: 0, // Inactive are pre-filtered out
    completedSizes,
    pendingSizes: totalS - completedSizes,
    completionPercentage: totalS > 0 ? Math.round((completedSizes / totalS) * 100) : 0,
    currentRequirement: reqRes.data || null,
    currentOrder: ordRes.data || null,
    totalAlterations: 0, 
  };

  return { students, sizeSummary, pendingSizes, classSection, overview };
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

  if (filters?.requirementStatus) {
    query = query.eq("status", filters.requirementStatus);
  }

  if (filters?.searchQuery) {
    const q = `%${filters.searchQuery.trim()}%`;
    query = query.ilike("requirement_number", q);
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
    const q = `%${filters.searchQuery.trim()}%`;
    query = query.ilike("order_number", q);
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
      students!inner (id, full_name, class_name, section, admission_number, gender),
      orders (order_number),
      alteration_request_history (id, status, note, created_at)
    `)
    .eq("school_id", profile.school_id);

  if (filters?.className) query = query.eq("students.class_name", filters.className);
  if (filters?.section) query = query.eq("students.section", filters.section);
  if (filters?.gender) query = query.eq("students.gender", filters.gender);
  if (filters?.alterationStatus) query = query.eq("status", filters.alterationStatus);

  if (filters?.searchQuery) {
    const q = `%${filters.searchQuery.trim()}%`;
    query = query.or(`request_number.ilike.${q},description.ilike.${q},full_name.ilike.${q},admission_number.ilike.${q}`, { foreignTable: "students" });
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
      admission_number: student?.admission_number || "",
      gender: student?.gender || "Unassigned",
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
    .select("class_name, section, gender")
    .eq("school_id", profile.school_id);

  const classesSet = new Set<string>();
  const sectionsSet = new Set<string>();
  const gendersSet = new Set<string>();

  (students || []).forEach(s => {
    if (s.class_name) classesSet.add(s.class_name);
    if (s.section) sectionsSet.add(s.section);
    if (s.gender) gendersSet.add(s.gender);
  });

  return {
    classes: Array.from(classesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sections: Array.from(sectionsSet).sort(),
    genders: Array.from(gendersSet).sort(),
  };
}

// Server-side secure Excel Export action
export async function exportReportToExcel(reportType: 'students' | 'size_summary' | 'sizes' | 'requirements' | 'orders' | 'alterations', filters?: ReportFilters) {
  const profile = await requireSchoolAdmin();
  if (!profile.school_id) throw new Error("Unauthorized access to export.");

  let exportData: Record<string, string | number>[] = [];
  let sheetName = "Report";
  const filename = `EVENVIBE_${reportType.toUpperCase()}_REPORT.xlsx`;

  if (reportType === 'students') {
    const data = await getStudentsReport(filters);
    sheetName = "Students";
    exportData = data.map(d => ({
      "Student Name": d.student_name,
      "Admission Number": d.admission_number,
      "Class": d.class_name,
      "Section": d.section,
      "Gender": d.gender,
      "Uniform Type": d.uniform_type,
      "Size Status": d.is_complete ? "Completed" : "Pending",
      "Missing Items": d.missingItems || "None",
      "Alteration Count": d.alterations_count
    }));
  } else if (reportType === 'size_summary') {
    const agg = await getAggregatedStudentData(filters);
    const summaryData = agg.sizeSummary;
    sheetName = "Size Summary";
    exportData = [];
    Object.entries(summaryData).forEach(([gender, items]) => {
      Object.entries(items).forEach(([item, sizes]) => {
        Object.entries(sizes).forEach(([size, qty]) => {
          exportData.push({ "Gender": gender, "Item": item, "Size": size, "Quantity": qty });
        });
      });
    });
  } else if (reportType === 'sizes') {
    const agg = await getAggregatedStudentData(filters);
    sheetName = "Pending Sizes";
    exportData = agg.pendingSizes.map(p => ({
      "Student Name": p.student_name,
      "Class": p.class_name,
      "Section": p.section,
      "Gender": p.gender,
      "Admission Number": p.admission_number,
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
      "Admission Number": a.admission_number,
      "Order Number": a.order_number,
      "Uniform Type": a.uniform_type,
      "Item": a.item_type,
      "Issue": a.issue_type,
      "Status": a.status,
      "Created At": new Date(a.created_at).toLocaleString(),
    }));
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

  return { success: true, filename, base64 };
}
