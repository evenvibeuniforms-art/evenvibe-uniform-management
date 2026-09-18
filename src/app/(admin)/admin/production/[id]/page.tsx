import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AdminProductionDetailsView from "../views/AdminProductionDetailsView";

export const metadata = {
  title: "Production Workspace | EvenVibe Admin",
};

export default async function AdminProductionDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch Order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      created_at,
      updated_at,
      requirement_id,
      school_id,
      schools (
        id,
        name
      ),
      requirements (
        id,
        requirement_number,
        total_students,
        regular_uniform_students,
        tshirt_uniform_students
      )
    `)
    .eq("id", id)
    .single();

  if (orderErr || !order) {
    notFound();
  }

  // Only allow orders that have reached at least 'confirmed'
  const validProductionLifecycles = [
    "confirmed",
    "production",
    "quality_check",
    "packed",
    "dispatched",
    "in_transit",
    "delivered",
  ];
  if (!validProductionLifecycles.includes(order.status)) {
    notFound();
  }

  // 2. Fetch Historical Requirement Items
  const { data: requirementItems } = await supabase
    .from("requirement_items")
    .select("*")
    .eq("requirement_id", order.requirement_id)
    .order("class_name", { nullsFirst: true })
    .order("section_name", { nullsFirst: true })
    .order("gender", { nullsFirst: true })
    .order("item_name")
    .order("size");

  // 2b. Fetch Authoritative Requirement Students to calculate distinct student counts
  const { data: reqStudents } = await supabase
    .from("requirement_students")
    .select("student_id")
    .eq("requirement_id", order.requirement_id);

  const studentIds = (reqStudents || []).map((rs) => rs.student_id);
  const distinctTrackedStudents = new Set(studentIds).size;
  const requirementRecord = Array.isArray(order.requirements)
    ? order.requirements[0]
    : order.requirements;
  const totalStudents =
    distinctTrackedStudents > 0
      ? distinctTrackedStudents
      : (requirementRecord?.total_students || 0);

  // Map student counts per dynamic item_name
  const itemStudentSets = new Map<string, Set<string>>();

  if (studentIds.length > 0) {
    // Fetch in batches of 200 to prevent query string limits on large orders
    const chunkSize = 200;
    const allSizes: {
      student_id: string;
      dynamic_sizes: unknown;
      shirt_size: string | null;
      pant_size: string | null;
      tshirt_size: string | null;
      short_size: string | null;
    }[] = [];

    for (let i = 0; i < studentIds.length; i += chunkSize) {
      const chunk = studentIds.slice(i, i + chunkSize);
      const { data: chunkSizes } = await supabase
        .from("student_uniform_sizes")
        .select("student_id, dynamic_sizes, shirt_size, pant_size, tshirt_size, short_size")
        .in("student_id", chunk);
      if (chunkSizes) {
        allSizes.push(...chunkSizes);
      }
    }

    const { data: configItems } = await supabase
      .from("school_uniform_configuration_items")
      .select("id, item_name");

    const configMap = new Map<string, string>();
    (configItems || []).forEach((ci) => {
      configMap.set(ci.id, ci.item_name.trim().toLowerCase());
    });

    allSizes.forEach((s) => {
      if (s.dynamic_sizes && typeof s.dynamic_sizes === "object") {
        Object.entries(s.dynamic_sizes as Record<string, string>).forEach(([key, val]) => {
          if (val && String(val).trim() !== "") {
            const mappedName = (configMap.get(key) || key).trim().toLowerCase();
            if (!itemStudentSets.has(mappedName)) {
              itemStudentSets.set(mappedName, new Set());
            }
            itemStudentSets.get(mappedName)!.add(s.student_id);
          }
        });
      }
      if (s.shirt_size && String(s.shirt_size).trim() !== "") {
        if (!itemStudentSets.has("shirt")) itemStudentSets.set("shirt", new Set());
        itemStudentSets.get("shirt")!.add(s.student_id);
      }
      if (s.pant_size && String(s.pant_size).trim() !== "") {
        if (!itemStudentSets.has("pant")) itemStudentSets.set("pant", new Set());
        itemStudentSets.get("pant")!.add(s.student_id);
      }
      if (s.tshirt_size && String(s.tshirt_size).trim() !== "") {
        if (!itemStudentSets.has("tshirt")) itemStudentSets.set("tshirt", new Set());
        itemStudentSets.get("tshirt")!.add(s.student_id);
      }
      if (s.short_size && String(s.short_size).trim() !== "") {
        if (!itemStudentSets.has("short")) itemStudentSets.set("short", new Set());
        itemStudentSets.get("short")!.add(s.student_id);
      }
    });
  }

  // Aggregate items from historical requirement_items snapshot
  const itemSummaryMap = new Map<
    string,
    { itemName: string; totalQuantity: number; studentCount: number | null }
  >();

  (requirementItems || []).forEach((item) => {
    const rawName = item.item_name || "Unknown Item";
    const key = rawName.trim().toLowerCase();

    if (!itemSummaryMap.has(key)) {
      itemSummaryMap.set(key, {
        itemName: rawName.trim(),
        totalQuantity: 0,
        studentCount: null,
      });
    }

    const entry = itemSummaryMap.get(key)!;
    entry.totalQuantity += item.quantity || 0;
  });

  const hasStudentTracking = studentIds.length > 0;
  itemSummaryMap.forEach((entry, key) => {
    if (hasStudentTracking) {
      const studentSet = itemStudentSets.get(key);
      entry.studentCount = studentSet ? studentSet.size : 0;
    } else {
      entry.studentCount = null; // Legacy untracked fallback
    }
  });

  const dynamicItems = Array.from(itemSummaryMap.values());

  // 3. Fetch Production Record
  const { data: productionRecord } = await supabase
    .from("production_records")
    .select("*")
    .eq("order_id", id)
    .maybeSingle();

  // 4. Fetch Production Stage History with profile of updater
  const { data: stageHistory } = await supabase
    .from("production_stage_history")
    .select(`
      id,
      production_record_id,
      order_id,
      from_stage,
      to_stage,
      note,
      created_at,
      changed_by,
      profiles:changed_by (
        id,
        full_name,
        role
      )
    `)
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  // 5. Fetch Order Status History (to find confirmed date and order events)
  const { data: orderStatusHistory } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  interface RawStageHistoryItem {
    id: string;
    production_record_id: string;
    order_id: string;
    from_stage: string | null;
    to_stage: string;
    note: string | null;
    created_at: string;
    changed_by: string;
    profiles:
      | { id: string; full_name: string | null; role: string }
      | { id: string; full_name: string | null; role: string }[]
      | null;
  }

  const rawHistory = (stageHistory || []) as unknown as RawStageHistoryItem[];
  const formattedStageHistory = rawHistory.map((item) => ({
    ...item,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
  }));

  const formattedOrder = {
    ...order,
    schools: Array.isArray(order.schools) ? order.schools[0] : order.schools,
    requirements: Array.isArray(order.requirements) ? order.requirements[0] : order.requirements,
  };

  return (
    <AdminProductionDetailsView
      order={formattedOrder}
      requirementItems={requirementItems || []}
      productionRecord={productionRecord || null}
      stageHistory={formattedStageHistory}
      orderStatusHistory={orderStatusHistory || []}
      totalStudents={totalStudents}
      dynamicItems={dynamicItems}
    />
  );
}
