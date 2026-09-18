"use server";

import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import {
  AdminDashboardData,
  PipelineStageCount,
  RecentOrderSummary,
  SchoolOperationalSummary,
} from "./types";

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  await requireAdmin();
  const supabase = await createClient();

  try {
    const [
      schoolsRes,
      studentsRes,
      ordersRes,
      productionRes,
      qcRes,
      packingRes,
    ] = await Promise.all([
      supabase
        .from("schools")
        .select("id, name, school_code, is_active, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("students")
        .select("id, school_id, is_active"),
      supabase
        .from("orders")
        .select(`
          id,
          order_number,
          status,
          school_id,
          created_at,
          requirements (
            total_students,
            requirement_items (
              quantity
            )
          )
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("production_records")
        .select("id, order_id, stage, total_quantity, completed_quantity"),
      supabase
        .from("quality_check_records")
        .select("id, order_id, status"),
      supabase
        .from("packing_records")
        .select("id, order_id, status"),
    ]);

    const schools = schoolsRes.data || [];
    const students = studentsRes.data || [];
    const orders = ordersRes.data || [];
    const productionRecords = productionRes.data || [];
    const qcRecords = qcRes.data || [];
    const packingRecords = packingRes.data || [];

    // School lookups
    const schoolMap = new Map(schools.map((s) => [s.id, s]));
    const activeSchoolIds = new Set(
      schools.filter((s) => s.is_active).map((s) => s.id)
    );

    // Primary KPIs
    const activeSchoolsCount = schools.filter((s) => s.is_active).length;
    const totalStudentsCount = students.filter(
      (st) => activeSchoolIds.has(st.school_id) && st.is_active !== false
    ).length;

    const activeOrdersCount = orders.filter(
      (o) => o.status !== "cancelled" && o.status !== "delivered"
    ).length;

    const ordersInProductionCount = orders.filter(
      (o) => o.status === "production"
    ).length;

    // Secondary KPIs
    const pendingSchoolsCount = schools.filter((s) => !s.is_active).length;
    const qcPendingCount = orders.filter(
      (o) => o.status === "quality_check"
    ).length;
    const packingPendingCount = orders.filter(
      (o) => o.status === "packed"
    ).length;
    const deliveryPendingCount = orders.filter(
      (o) => o.status === "dispatched" || o.status === "in_transit"
    ).length;

    // Order Pipeline calculation
    const pipelineStages: PipelineStageCount[] = [
      {
        stage: "submitted",
        label: "Submitted",
        count: orders.filter((o) => o.status === "submitted").length,
        colorClass: "bg-blue-50 text-blue-700 border-blue-200",
      },
      {
        stage: "under_review",
        label: "Under Review",
        count: orders.filter((o) => o.status === "under_review").length,
        colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
      },
      {
        stage: "confirmed",
        label: "Confirmed",
        count: orders.filter((o) => o.status === "confirmed").length,
        colorClass: "bg-sky-50 text-sky-700 border-sky-200",
      },
      {
        stage: "production",
        label: "Production",
        count: orders.filter((o) => o.status === "production").length,
        colorClass: "bg-amber-50 text-amber-700 border-amber-200",
      },
      {
        stage: "quality_check",
        label: "Quality Check",
        count: orders.filter((o) => o.status === "quality_check").length,
        colorClass: "bg-purple-50 text-purple-700 border-purple-200",
      },
      {
        stage: "packed",
        label: "Packed",
        count: orders.filter((o) => o.status === "packed").length,
        colorClass: "bg-teal-50 text-teal-700 border-teal-200",
      },
      {
        stage: "dispatched",
        label: "Dispatched",
        count: orders.filter((o) => o.status === "dispatched").length,
        colorClass: "bg-cyan-50 text-cyan-700 border-cyan-200",
      },
      {
        stage: "in_transit",
        label: "In Transit",
        count: orders.filter((o) => o.status === "in_transit").length,
        colorClass: "bg-orange-50 text-orange-700 border-orange-200",
      },
      {
        stage: "delivered",
        label: "Delivered",
        count: orders.filter((o) => o.status === "delivered").length,
        colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      },
      {
        stage: "cancelled",
        label: "Cancelled",
        count: orders.filter((o) => o.status === "cancelled").length,
        colorClass: "bg-slate-50 text-slate-600 border-slate-200",
      },
    ];

    // Recent Orders (top 5-10 real orders)
    const recentOrders: RecentOrderSummary[] = orders.slice(0, 10).map((o) => {
      const school = schoolMap.get(o.school_id);
      
      const req = Array.isArray(o.requirements)
        ? o.requirements[0]
        : o.requirements;

      const items = (req?.requirement_items || []) as Array<{ quantity: number }>;
      const itemsCount = items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0
      );

      return {
        id: o.id,
        order_number: o.order_number,
        school_id: o.school_id,
        school_name: school?.name || "Unknown School",
        created_at: o.created_at,
        students_count: Number(req?.total_students) || 0,
        items_count: itemsCount,
        status: o.status,
      };
    });

    // School Overview (schools with operational metrics)
    const schoolOverview: SchoolOperationalSummary[] = schools.map((s) => {
      const schoolStudents = students.filter((st) => st.school_id === s.id);
      const schoolOrders = orders.filter((o) => o.school_id === s.id);
      const latestOrder = schoolOrders[0] || null;

      return {
        id: s.id,
        name: s.name,
        school_code: s.school_code,
        students_count: schoolStudents.length,
        orders_count: schoolOrders.length,
        latest_order_number: latestOrder?.order_number || null,
        latest_order_status: latestOrder?.status || null,
        latest_order_date: latestOrder?.created_at || null,
        is_active: s.is_active,
      };
    });

    // Sort school overview: active schools with orders first, then active without orders, then inactive
    schoolOverview.sort((a, b) => {
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      if (a.orders_count !== b.orders_count) {
        return b.orders_count - a.orders_count;
      }
      return a.name.localeCompare(b.name);
    });

    // Production Overview
    let totalProdQty = 0;
    let completedProdQty = 0;
    productionRecords.forEach((r) => {
      totalProdQty += Number(r.total_quantity) || 0;
      completedProdQty += Number(r.completed_quantity) || 0;
    });

    const completedProductionRecordsCount = productionRecords.filter(
      (r) => r.stage === "production_completed"
    ).length;

    const productionOverview = {
      productionOrdersCount: ordersInProductionCount,
      completedProductionCount: completedProductionRecordsCount,
      totalQuantity: totalProdQty,
      completedQuantity: completedProdQty,
      pendingQuantity: Math.max(0, totalProdQty - completedProdQty),
    };

    // Quality Check Overview
    const qcOverview = {
      pending: qcRecords.filter((r) => r.status === "pending").length,
      in_progress: qcRecords.filter((r) => r.status === "in_progress").length,
      passed: qcRecords.filter((r) => r.status === "passed").length,
      failed: qcRecords.filter((r) => r.status === "failed").length,
    };

    // Packing & Delivery Overview
    const packingDeliveryOverview = {
      packingPending: packingRecords.filter((r) => r.status === "pending").length,
      packingInProgress: packingRecords.filter((r) => r.status === "in_progress").length,
      readyForDispatch: orders.filter((o) => o.status === "packed").length,
      inTransit: orders.filter((o) => o.status === "in_transit").length,
      delivered: orders.filter((o) => o.status === "delivered").length,
    };

    return {
      primaryKPIs: {
        activeSchoolsCount,
        totalStudentsCount,
        activeOrdersCount,
        ordersInProductionCount,
      },
      secondaryKPIs: {
        pendingSchoolsCount,
        qcPendingCount,
        packingPendingCount,
        deliveryPendingCount,
      },
      pipelineStages,
      recentOrders,
      schoolOverview,
      productionOverview,
      qcOverview,
      packingDeliveryOverview,
    };
  } catch (error) {
    console.error("[getAdminDashboardData] Error fetching dashboard data:", error);
    throw new Error("Unable to load dashboard data. Please try again.");
  }
}
