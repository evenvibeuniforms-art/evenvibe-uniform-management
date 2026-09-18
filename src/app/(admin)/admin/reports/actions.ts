"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import * as XLSX from "xlsx";
import {
  DateFilterOption,
  GlobalReportFilters,
  DashboardKPISummary,
  OrderStatusCount,
  QualitySummaryKPI,
  DeliverySummaryKPI,
  SchoolPerformanceRow,
  StudentReportRow,
  UniformSizeReportItem,
  OrderReportRow,
  ProductionReportRow,
  QualityCheckReportRow,
  PackingReportRow,
  DeliveryReportRow,
  PaginationParams,
  PaginatedResult,
  SchoolOption,
} from "./types";

// Helper: compute start & end UTC ISO strings for date presets using IST (UTC+5:30)
function getDateBounds(
  dateFilter: DateFilterOption,
  customStart?: string,
  customEnd?: string
): { start: string | null; end: string | null } {
  if (dateFilter === "all") {
    return { start: null, end: null };
  }

  const now = new Date();
  // IST offset in ms = 5.5 * 60 * 60 * 1000
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(now.getTime() + istOffset);

  if (dateFilter === "today") {
    const startIst = new Date(nowIst);
    startIst.setUTCHours(0, 0, 0, 0);
    const endIst = new Date(nowIst);
    endIst.setUTCHours(23, 59, 59, 999);
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: new Date(endIst.getTime() - istOffset).toISOString(),
    };
  }

  if (dateFilter === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }

  if (dateFilter === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: now.toISOString() };
  }

  if (dateFilter === "this_month") {
    const startIst = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1, 0, 0, 0, 0));
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: now.toISOString(),
    };
  }

  if (dateFilter === "last_month") {
    const startIst = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const endIst = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 0, 23, 59, 59, 999));
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: new Date(endIst.getTime() - istOffset).toISOString(),
    };
  }

  if (dateFilter === "custom" && customStart && customEnd) {
    const startIst = new Date(`${customStart}T00:00:00Z`);
    const endIst = new Date(`${customEnd}T23:59:59.999Z`);
    return {
      start: new Date(startIst.getTime() - istOffset).toISOString(),
      end: new Date(endIst.getTime() - istOffset).toISOString(),
    };
  }

  return { start: null, end: null };
}

export async function getSchoolOptions(): Promise<SchoolOption[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("id, name")
    .order("name", { ascending: true });
  return data || [];
}

export async function getDashboardKPISummary(
  filters: GlobalReportFilters
): Promise<{
  summary: DashboardKPISummary;
  statusDistribution: OrderStatusCount[];
  qualitySummary: QualitySummaryKPI;
  deliverySummary: DeliverySummaryKPI;
}> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  // 1. Total Schools
  const { count: totalSchools } = await supabase
    .from("schools")
    .select("*", { count: "exact", head: true });

  // 2. Total Students
  let studentsQuery = supabase.from("students").select("*", { count: "exact", head: true });
  if (filters.schoolId && filters.schoolId !== "all") {
    studentsQuery = studentsQuery.eq("school_id", filters.schoolId);
  }
  const { count: totalStudents } = await studentsQuery;

  // 3. Orders within date & school filter
  let ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      status,
      created_at,
      school_id,
      requirement_id,
      requirements (
        id,
        requirement_items (
          quantity
        )
      )
    `);

  if (filters.schoolId && filters.schoolId !== "all") {
    ordersQuery = ordersQuery.eq("school_id", filters.schoolId);
  }
  if (bounds.start) {
    ordersQuery = ordersQuery.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    ordersQuery = ordersQuery.lte("created_at", bounds.end);
  }

  const { data: rawOrders } = await ordersQuery;
  const orders = rawOrders || [];
  const totalOrders = orders.length;

  // Calculate total ordered items from historical requirement_items
  let totalOrderedItems = 0;
  let ordersInProduction = 0;
  let ordersInQC = 0;
  let ordersPacked = 0;
  let ordersDelivered = 0;

  const statusMap: Record<string, number> = {
    submitted: 0,
    under_review: 0,
    confirmed: 0,
    production: 0,
    quality_check: 0,
    packed: 0,
    dispatched: 0,
    in_transit: 0,
    delivered: 0,
    cancelled: 0,
  };

  orders.forEach((o) => {
    // Stage counts
    if (statusMap[o.status] !== undefined) {
      statusMap[o.status]++;
    }
    if (o.status === "production") ordersInProduction++;
    if (o.status === "quality_check") ordersInQC++;
    if (o.status === "packed") ordersPacked++;
    if (o.status === "delivered") ordersDelivered++;

    // Historical items sum
    const req = Array.isArray(o.requirements) ? o.requirements[0] : o.requirements;
    const items = req?.requirement_items || [];
    items.forEach((it: { quantity: number }) => {
      totalOrderedItems += it.quantity || 0;
    });
  });

  const statusLabels: Record<string, string> = {
    submitted: "Submitted",
    under_review: "Under Review",
    confirmed: "Confirmed",
    production: "Production",
    quality_check: "Quality Check",
    packed: "Packed",
    dispatched: "Dispatched",
    in_transit: "In Transit",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  const statusDistribution: OrderStatusCount[] = Object.keys(statusMap).map((k) => ({
    status: k,
    label: statusLabels[k] || k,
    count: statusMap[k],
    percentage: totalOrders > 0 ? Math.round((statusMap[k] / totalOrders) * 100) : 0,
  }));

  // 4. Quality Check Summary
  let qcQuery = supabase
    .from("quality_check_records")
    .select("total_quantity, checked_quantity, passed_quantity, defective_quantity, created_at, orders(school_id)");
  if (bounds.start) qcQuery = qcQuery.gte("created_at", bounds.start);
  if (bounds.end) qcQuery = qcQuery.lte("created_at", bounds.end);

  const { data: qcRecordsRaw } = await qcQuery;
  const qcRecords = (qcRecordsRaw || []).filter((q) => {
    if (!filters.schoolId || filters.schoolId === "all") return true;
    const ord = Array.isArray(q.orders) ? q.orders[0] : q.orders;
    return ord?.school_id === filters.schoolId;
  });

  let totalChecked = 0;
  let totalPassed = 0;
  let totalDefective = 0;
  qcRecords.forEach((q) => {
    totalChecked += q.checked_quantity || 0;
    totalPassed += q.passed_quantity || 0;
    totalDefective += q.defective_quantity || 0;
  });
  const defectRate = totalChecked > 0 ? Math.round((totalDefective / totalChecked) * 10000) / 100 : 0;

  // 5. Delivery Summary
  let delivQuery = supabase
    .from("orders")
    .select("id, status, shipped_at, delivered_at, school_id")
    .in("status", ["dispatched", "in_transit", "delivered"]);
  if (filters.schoolId && filters.schoolId !== "all") {
    delivQuery = delivQuery.eq("school_id", filters.schoolId);
  }
  if (bounds.start) delivQuery = delivQuery.gte("created_at", bounds.start);
  if (bounds.end) delivQuery = delivQuery.lte("created_at", bounds.end);

  const { data: delivOrders } = await delivQuery;
  const deliveries = delivOrders || [];
  let inTransit = 0;
  let delivered = 0;
  deliveries.forEach((d) => {
    if (d.status === "in_transit") inTransit++;
    if (d.status === "delivered") delivered++;
  });
  const totalDispatched = deliveries.length;
  const pendingDelivery = inTransit + deliveries.filter((d) => d.status === "dispatched").length;
  const completionRate =
    totalDispatched > 0 ? Math.round((delivered / totalDispatched) * 10000) / 100 : 0;

  return {
    summary: {
      totalSchools: totalSchools || 0,
      totalStudents: totalStudents || 0,
      totalOrders,
      totalOrderedItems,
      ordersInProduction,
      ordersInQC,
      ordersPacked,
      ordersDelivered,
    },
    statusDistribution,
    qualitySummary: {
      totalChecked,
      totalPassed,
      totalDefective,
      defectRate,
    },
    deliverySummary: {
      totalDispatched,
      inTransit,
      delivered,
      pendingDelivery,
      completionRate,
    },
  };
}

export async function getSchoolPerformanceReport(
  filters: GlobalReportFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<SchoolPerformanceRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase.from("schools").select("id, name, school_code");
  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("id", filters.schoolId);
  }
  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim();
    query = query.or(`name.ilike.%${q}%,school_code.ilike.%${q}%`);
  }
  query = query.order("name", { ascending: true });

  const { data: schools } = await query;
  if (!schools || schools.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  // Fetch student counts grouped by school
  const { data: studentCountsRaw } = await supabase
    .from("students")
    .select("school_id");
  const studentCountMap = new Map<string, number>();
  (studentCountsRaw || []).forEach((st) => {
    studentCountMap.set(st.school_id, (studentCountMap.get(st.school_id) || 0) + 1);
  });

  // Fetch orders for schools
  let ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      school_id,
      status,
      created_at,
      requirements (
        requirement_items (
          quantity
        )
      )
    `);
  if (bounds.start) ordersQuery = ordersQuery.gte("created_at", bounds.start);
  if (bounds.end) ordersQuery = ordersQuery.lte("created_at", bounds.end);
  const { data: orders } = await ordersQuery;

  const schoolOrdersMap = new Map<string, typeof orders>();
  (orders || []).forEach((o) => {
    const list = schoolOrdersMap.get(o.school_id) || [];
    list.push(o);
    schoolOrdersMap.set(o.school_id, list);
  });

  const rows: SchoolPerformanceRow[] = schools.map((s) => {
    const schoolOrders = schoolOrdersMap.get(s.id) || [];
    let totalItems = 0;
    let deliveredOrders = 0;
    let pendingOrders = 0;
    let currentOrderStage = "—";

    if (schoolOrders.length > 0) {
      // Sort orders by created_at desc to find latest stage
      schoolOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      currentOrderStage = schoolOrders[0].status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      schoolOrders.forEach((o) => {
        if (o.status === "delivered") deliveredOrders++;
        else if (o.status !== "cancelled") pendingOrders++;

        const req = Array.isArray(o.requirements) ? o.requirements[0] : o.requirements;
        const items = req?.requirement_items || [];
        items.forEach((it: { quantity: number }) => {
          totalItems += it.quantity || 0;
        });
      });
    }

    return {
      schoolId: s.id,
      schoolName: s.name,
      schoolCode: s.school_code || "—",
      totalStudents: studentCountMap.get(s.id) || 0,
      orderCount: schoolOrders.length,
      totalItems,
      currentOrderStage,
      deliveredOrders,
      pendingOrders,
    };
  });

  const totalCount = rows.length;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);
  const startIdx = (pagination.page - 1) * pagination.pageSize;
  const paginatedData = rows.slice(startIdx, startIdx + pagination.pageSize);

  return {
    data: paginatedData,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getStudentReport(
  filters: GlobalReportFilters & {
    className?: string;
    gender?: string;
    sizeStatus?: string;
  },
  pagination: PaginationParams
): Promise<PaginatedResult<StudentReportRow>> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("students")
    .select(`
      id,
      student_name,
      admission_number,
      class_name,
      section,
      gender,
      school_id,
      schools (
        name
      ),
      student_uniform_sizes (
        is_complete
      )
    `, { count: "exact" });

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("school_id", filters.schoolId);
  }
  if (filters.className && filters.className !== "all") {
    query = query.eq("class_name", filters.className);
  }
  if (filters.gender && filters.gender !== "all") {
    query = query.eq("gender", filters.gender);
  }
  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim();
    query = query.or(`student_name.ilike.%${q}%,admission_number.ilike.%${q}%`);
  }

  query = query.order("class_name").order("section").order("student_name");

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: students, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!students || students.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  // Count order participation using requirement_students
  const studentIds = students.map((s) => s.id);
  const { data: reqStudents } = await supabase
    .from("requirement_students")
    .select("student_id, requirement_id")
    .in("student_id", studentIds);

  const participationMap = new Map<string, number>();
  (reqStudents || []).forEach((rs) => {
    participationMap.set(rs.student_id, (participationMap.get(rs.student_id) || 0) + 1);
  });

  const rows: StudentReportRow[] = students.map((s) => {
    const school = Array.isArray(s.schools) ? s.schools[0] : s.schools;
    const sizes = Array.isArray(s.student_uniform_sizes)
      ? s.student_uniform_sizes[0]
      : s.student_uniform_sizes;

    const sizeStatus: "completed" | "pending" = sizes?.is_complete ? "completed" : "pending";

    return {
      studentId: s.id,
      studentName: s.student_name,
      admissionNumber: s.admission_number || "—",
      schoolName: school?.name || "School",
      className: s.class_name || "—",
      section: s.section || "—",
      gender: s.gender || "—",
      sizeStatus,
      orderParticipationCount: participationMap.get(s.id) || 0,
    };
  });

  let filteredRows = rows;
  if (filters.sizeStatus && filters.sizeStatus !== "all") {
    filteredRows = filteredRows.filter((r) => r.sizeStatus === filters.sizeStatus);
  }

  return {
    data: filteredRows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getUniformSizeReport(
  filters: GlobalReportFilters & {
    className?: string;
    gender?: string;
    itemName?: string;
    size?: string;
  },
  pagination: PaginationParams
): Promise<PaginatedResult<UniformSizeReportItem>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  // Query historical requirement items joined with order
  let query = supabase
    .from("requirement_items")
    .select(`
      id,
      class_name,
      section_name,
      gender,
      item_name,
      size,
      quantity,
      created_at,
      requirements!inner (
        id,
        orders (
          id,
          school_id,
          schools (
            name
          )
        )
      )
    `);

  if (bounds.start) query = query.gte("created_at", bounds.start);
  if (bounds.end) query = query.lte("created_at", bounds.end);

  const { data: rawItems } = await query;
  if (!rawItems || rawItems.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  // Aggregate items into hierarchy
  const aggregatedMap = new Map<string, UniformSizeReportItem>();

  rawItems.forEach((it) => {
    const req = Array.isArray(it.requirements) ? it.requirements[0] : it.requirements;
    const ordList = req?.orders;
    const ord = Array.isArray(ordList) ? ordList[0] : ordList;
    const school = Array.isArray(ord?.schools) ? ord?.schools[0] : ord?.schools;
    const schoolId = ord?.school_id;
    const schoolName = school?.name || "School";

    if (filters.schoolId && filters.schoolId !== "all" && schoolId !== filters.schoolId) {
      return;
    }
    if (filters.className && filters.className !== "all" && it.class_name !== filters.className) {
      return;
    }
    if (filters.gender && filters.gender !== "all" && it.gender !== filters.gender) {
      return;
    }
    if (filters.itemName && filters.itemName !== "all" && it.item_name !== filters.itemName) {
      return;
    }
    if (filters.size && filters.size !== "all" && it.size !== filters.size) {
      return;
    }

    const key = `${schoolName}|${it.class_name || "—"}|${it.section_name || "—"}|${it.gender || "—"}|${it.item_name}|${it.size}`;
    if (!aggregatedMap.has(key)) {
      aggregatedMap.set(key, {
        schoolName,
        className: it.class_name || "—",
        section: it.section_name || "—",
        gender: it.gender || "—",
        itemName: it.item_name || "Uniform Item",
        size: it.size || "—",
        quantity: 0,
      });
    }
    aggregatedMap.get(key)!.quantity += it.quantity || 0;
  });

  const rows = Array.from(aggregatedMap.values()).sort((a, b) => {
    const sComp = a.schoolName.localeCompare(b.schoolName);
    if (sComp !== 0) return sComp;
    const cComp = a.className.localeCompare(b.className);
    if (cComp !== 0) return cComp;
    return a.itemName.localeCompare(b.itemName);
  });

  const totalCount = rows.length;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);
  const startIdx = (pagination.page - 1) * pagination.pageSize;
  const paginatedData = rows.slice(startIdx, startIdx + pagination.pageSize);

  return {
    data: paginatedData,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getOrderReport(
  filters: GlobalReportFilters & { status?: string },
  pagination: PaginationParams
): Promise<PaginatedResult<OrderReportRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      updated_at,
      school_id,
      requirement_id,
      schools (
        name
      ),
      requirements (
        id,
        total_students,
        requirement_items (
          quantity
        )
      )
    `, { count: "exact" });

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("school_id", filters.schoolId);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (bounds.start) {
    query = query.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    query = query.lte("created_at", bounds.end);
  }
  if (filters.searchQuery?.trim()) {
    const q = filters.searchQuery.trim();
    query = query.or(`order_number.ilike.%${q}%`);
  }

  query = query.order("created_at", { ascending: false });

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: rawOrders, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!rawOrders || rawOrders.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  // Get distinct student counts from requirement_students for these orders
  const reqIds = rawOrders.map((o) => o.requirement_id).filter(Boolean);
  const { data: reqStudents } = await supabase
    .from("requirement_students")
    .select("requirement_id, student_id")
    .in("requirement_id", reqIds);

  const reqStudentSetMap = new Map<string, Set<string>>();
  (reqStudents || []).forEach((rs) => {
    if (!reqStudentSetMap.has(rs.requirement_id)) {
      reqStudentSetMap.set(rs.requirement_id, new Set());
    }
    reqStudentSetMap.get(rs.requirement_id)!.add(rs.student_id);
  });

  const rows: OrderReportRow[] = rawOrders.map((o) => {
    const school = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    const req = Array.isArray(o.requirements) ? o.requirements[0] : o.requirements;
    const items = req?.requirement_items || [];
    const totalItems = items.reduce((acc: number, it: { quantity: number }) => acc + (it.quantity || 0), 0);

    const trackedCount = reqStudentSetMap.get(o.requirement_id)?.size;
    let totalStudents: number | string = "—";
    if (trackedCount !== undefined && trackedCount > 0) {
      totalStudents = trackedCount;
    } else if (req?.total_students) {
      totalStudents = req.total_students;
    }

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      schoolName: school?.name || "School",
      orderDate: o.created_at,
      totalStudents,
      totalItems,
      status: o.status,
      lastUpdated: o.updated_at,
    };
  });

  return {
    data: rows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getProductionReport(
  filters: GlobalReportFilters & { stage?: string },
  pagination: PaginationParams
): Promise<PaginatedResult<ProductionReportRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase
    .from("production_records")
    .select(`
      id,
      order_id,
      stage,
      total_quantity,
      completed_quantity,
      remarks,
      started_at,
      completed_at,
      created_at,
      orders!inner (
        id,
        order_number,
        school_id,
        schools (
          name
        )
      )
    `, { count: "exact" });

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("orders.school_id", filters.schoolId);
  }
  if (filters.stage && filters.stage !== "all") {
    query = query.eq("stage", filters.stage);
  }
  if (bounds.start) {
    query = query.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    query = query.lte("created_at", bounds.end);
  }
  if (filters.searchQuery?.trim()) {
    query = query.ilike("orders.order_number", `%${filters.searchQuery.trim()}%`);
  }

  query = query.order("created_at", { ascending: false });

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: rawProds, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!rawProds || rawProds.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  const rows: ProductionReportRow[] = rawProds.map((p) => {
    const ord = Array.isArray(p.orders) ? p.orders[0] : p.orders;
    const school = Array.isArray(ord?.schools) ? ord?.schools[0] : ord?.schools;
    const totalQuantity = p.total_quantity || 0;
    const completedQuantity = p.completed_quantity || 0;
    const pendingQuantity = Math.max(0, totalQuantity - completedQuantity);

    return {
      orderId: p.order_id,
      orderNumber: ord?.order_number || "—",
      schoolName: school?.name || "School",
      totalQuantity,
      completedQuantity,
      pendingQuantity,
      stage: p.stage,
      startedAt: p.started_at,
      completedAt: p.completed_at,
      remarks: p.remarks,
    };
  });

  return {
    data: rows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getQualityCheckReport(
  filters: GlobalReportFilters & { status?: string },
  pagination: PaginationParams
): Promise<PaginatedResult<QualityCheckReportRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase
    .from("quality_check_records")
    .select(`
      id,
      order_id,
      status,
      total_quantity,
      checked_quantity,
      passed_quantity,
      defective_quantity,
      started_at,
      completed_at,
      created_at,
      orders!inner (
        id,
        order_number,
        school_id,
        schools (
          name
        )
      )
    `, { count: "exact" });

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("orders.school_id", filters.schoolId);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (bounds.start) {
    query = query.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    query = query.lte("created_at", bounds.end);
  }
  if (filters.searchQuery?.trim()) {
    query = query.ilike("orders.order_number", `%${filters.searchQuery.trim()}%`);
  }

  query = query.order("created_at", { ascending: false });

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: rawQc, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!rawQc || rawQc.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  const rows: QualityCheckReportRow[] = rawQc.map((q) => {
    const ord = Array.isArray(q.orders) ? q.orders[0] : q.orders;
    const school = Array.isArray(ord?.schools) ? ord?.schools[0] : ord?.schools;
    const checked = q.checked_quantity || 0;
    const defective = q.defective_quantity || 0;
    const defectRate = checked > 0 ? Math.round((defective / checked) * 10000) / 100 : 0;

    return {
      orderId: q.order_id,
      orderNumber: ord?.order_number || "—",
      schoolName: school?.name || "School",
      totalQuantity: q.total_quantity || 0,
      checkedQuantity: checked,
      passedQuantity: q.passed_quantity || 0,
      defectiveQuantity: defective,
      defectRate,
      status: q.status,
      startedAt: q.started_at,
      completedAt: q.completed_at,
    };
  });

  return {
    data: rows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getPackingReport(
  filters: GlobalReportFilters & { status?: string },
  pagination: PaginationParams
): Promise<PaginatedResult<PackingReportRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase
    .from("packing_records")
    .select(`
      id,
      order_id,
      status,
      total_quantity,
      packed_quantity,
      started_at,
      completed_at,
      created_at,
      orders!inner (
        id,
        order_number,
        school_id,
        schools (
          name
        )
      )
    `, { count: "exact" });

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("orders.school_id", filters.schoolId);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (bounds.start) {
    query = query.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    query = query.lte("created_at", bounds.end);
  }
  if (filters.searchQuery?.trim()) {
    query = query.ilike("orders.order_number", `%${filters.searchQuery.trim()}%`);
  }

  query = query.order("created_at", { ascending: false });

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: rawPacking, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!rawPacking || rawPacking.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  const rows: PackingReportRow[] = rawPacking.map((pk) => {
    const ord = Array.isArray(pk.orders) ? pk.orders[0] : pk.orders;
    const school = Array.isArray(ord?.schools) ? ord?.schools[0] : ord?.schools;
    const totalQuantity = pk.total_quantity || 0;
    const packedQuantity = pk.packed_quantity || 0;
    const pendingQuantity = Math.max(0, totalQuantity - packedQuantity);
    const progressPercent = totalQuantity > 0 ? Math.min(100, Math.round((packedQuantity / totalQuantity) * 100)) : 0;

    return {
      orderId: pk.order_id,
      orderNumber: ord?.order_number || "—",
      schoolName: school?.name || "School",
      totalQuantity,
      packedQuantity,
      pendingQuantity,
      status: pk.status,
      progressPercent,
      startedAt: pk.started_at,
      completedAt: pk.completed_at,
    };
  });

  return {
    data: rows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getDeliveryReport(
  filters: GlobalReportFilters & { status?: string },
  pagination: PaginationParams
): Promise<PaginatedResult<DeliveryReportRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const bounds = getDateBounds(filters.dateFilter, filters.customStartDate, filters.customEndDate);

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      courier_name,
      tracking_number,
      estimated_delivery,
      shipped_at,
      delivered_at,
      created_at,
      school_id,
      schools (
        name
      )
    `, { count: "exact" })
    .in("status", ["packed", "dispatched", "in_transit", "delivered"]);

  if (filters.schoolId && filters.schoolId !== "all") {
    query = query.eq("school_id", filters.schoolId);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (bounds.start) {
    query = query.gte("created_at", bounds.start);
  }
  if (bounds.end) {
    query = query.lte("created_at", bounds.end);
  }
  if (filters.searchQuery?.trim()) {
    query = query.ilike("order_number", `%${filters.searchQuery.trim()}%`);
  }

  query = query.order("created_at", { ascending: false });

  const startIdx = (pagination.page - 1) * pagination.pageSize;
  query = query.range(startIdx, startIdx + pagination.pageSize - 1);

  const { data: rawDeliv, count } = await query;
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pagination.pageSize);

  if (!rawDeliv || rawDeliv.length === 0) {
    return { data: [], totalCount: 0, page: pagination.page, pageSize: pagination.pageSize, totalPages: 0 };
  }

  const rows: DeliveryReportRow[] = rawDeliv.map((d) => {
    const school = Array.isArray(d.schools) ? d.schools[0] : d.schools;
    return {
      orderId: d.id,
      orderNumber: d.order_number,
      schoolName: school?.name || "School",
      courierName: d.courier_name,
      trackingNumber: d.tracking_number,
      estimatedDelivery: d.estimated_delivery,
      shippedAt: d.shipped_at,
      deliveredAt: d.delivered_at,
      status: d.status,
    };
  });

  return {
    data: rows,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

// Full Dataset Excel Export
export async function exportCompleteReportToExcel(
  tabName: string,
  filters: GlobalReportFilters
): Promise<{ fileName: string; base64: string } | { error: string }> {
  try {
    await requireAdmin();

    const largePagination: PaginationParams = { page: 1, pageSize: 50000 };
    const wb = XLSX.utils.book_new();

    const formatDateStr = (d: string | null) => {
      if (!d) return "—";
      const dt = new Date(d);
      return dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    if (tabName === "schools") {
      const res = await getSchoolPerformanceReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "School Name": r.schoolName,
        "School Code": r.schoolCode,
        "Total Students": r.totalStudents,
        "Total Orders": r.orderCount,
        "Total Items Ordered": r.totalItems,
        "Current Order Stage": r.currentOrderStage,
        "Delivered Orders": r.deliveredOrders,
        "Pending Orders": r.pendingOrders,
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Schools");
    } else if (tabName === "students") {
      const res = await getStudentReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Student Name": r.studentName,
        "Admission Number": r.admissionNumber,
        School: r.schoolName,
        Class: r.className,
        Section: r.section,
        Gender: r.gender,
        "Size Collection Status": r.sizeStatus === "completed" ? "Completed" : "Pending",
        "Order Participation (Count)": r.orderParticipationCount,
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Students");
    } else if (tabName === "uniform_sizes") {
      const res = await getUniformSizeReport(filters, largePagination);
      const data = res.data.map((r) => ({
        School: r.schoolName,
        Class: r.className,
        Section: r.section,
        Gender: r.gender,
        "Uniform Item": r.itemName,
        Size: r.size,
        Quantity: r.quantity,
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Uniform Sizes");
    } else if (tabName === "orders") {
      const res = await getOrderReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Order Number": r.orderNumber,
        School: r.schoolName,
        "Order Date": formatDateStr(r.orderDate),
        "Total Students": r.totalStudents,
        "Total Items": r.totalItems,
        Status: r.status.replace(/_/g, " ").toUpperCase(),
        "Last Updated": formatDateStr(r.lastUpdated),
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
    } else if (tabName === "production") {
      const res = await getProductionReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Order Number": r.orderNumber,
        School: r.schoolName,
        "Total Quantity": r.totalQuantity,
        "Completed Quantity": r.completedQuantity,
        "Pending Quantity": r.pendingQuantity,
        Stage: r.stage.replace(/_/g, " ").toUpperCase(),
        "Started Date": formatDateStr(r.startedAt),
        "Completed Date": formatDateStr(r.completedAt),
        Remarks: r.remarks || "—",
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Production");
    } else if (tabName === "quality_check") {
      const res = await getQualityCheckReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Order Number": r.orderNumber,
        School: r.schoolName,
        "Total Quantity": r.totalQuantity,
        "Checked Quantity": r.checkedQuantity,
        "Passed Quantity": r.passedQuantity,
        "Defective Quantity": r.defectiveQuantity,
        "Defect Rate (%)": `${r.defectRate.toFixed(2)}%`,
        "QC Status": r.status.replace(/_/g, " ").toUpperCase(),
        "Started Date": formatDateStr(r.startedAt),
        "Completed Date": formatDateStr(r.completedAt),
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Quality Check");
    } else if (tabName === "packing") {
      const res = await getPackingReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Order Number": r.orderNumber,
        School: r.schoolName,
        "Total Quantity": r.totalQuantity,
        "Packed Quantity": r.packedQuantity,
        "Pending Quantity": r.pendingQuantity,
        "Packing Status": r.status.replace(/_/g, " ").toUpperCase(),
        "Progress (%)": `${r.progressPercent}%`,
        "Started Date": formatDateStr(r.startedAt),
        "Completed Date": formatDateStr(r.completedAt),
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Packing");
    } else if (tabName === "delivery") {
      const res = await getDeliveryReport(filters, largePagination);
      const data = res.data.map((r) => ({
        "Order Number": r.orderNumber,
        School: r.schoolName,
        Courier: r.courierName || "—",
        "Tracking Number": r.trackingNumber || "—",
        "Estimated Delivery": r.estimatedDelivery || "—",
        "Shipped Date": formatDateStr(r.shippedAt),
        "Delivered Date": formatDateStr(r.deliveredAt),
        "Delivery Status": r.status.replace(/_/g, " ").toUpperCase(),
      }));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Message: "No records found" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Delivery");
    } else {
      // Overview export
      const summary = await getDashboardKPISummary(filters);
      const overviewData = [
        { Metric: "Total Partner Schools", Value: summary.summary.totalSchools },
        { Metric: "Total Enrolled Students", Value: summary.summary.totalStudents },
        { Metric: "Total Orders", Value: summary.summary.totalOrders },
        { Metric: "Total Ordered Items", Value: summary.summary.totalOrderedItems },
        { Metric: "Orders in Production", Value: summary.summary.ordersInProduction },
        { Metric: "Orders in Quality Check", Value: summary.summary.ordersInQC },
        { Metric: "Orders Packed", Value: summary.summary.ordersPacked },
        { Metric: "Orders Delivered", Value: summary.summary.ordersDelivered },
        { Metric: "QC Defect Rate (%)", Value: `${summary.qualitySummary.defectRate}%` },
        { Metric: "Delivery Completion Rate (%)", Value: `${summary.deliverySummary.completionRate}%` },
      ];
      const ws = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, ws, "Overview");
    }

    const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const fileName = `EvenVibe_${tabName.toUpperCase()}_Report_${new Date().toISOString().split("T")[0]}.xlsx`;

    return { fileName, base64 };
  } catch (err: unknown) {
    console.error("exportCompleteReportToExcel error:", err);
    return { error: err instanceof Error ? err.message : "Failed to export report" };
  }
}
