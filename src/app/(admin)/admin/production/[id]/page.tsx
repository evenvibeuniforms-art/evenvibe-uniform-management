import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AdminProductionDetailsView from "../views/AdminProductionDetailsView";
import { DEFAULT_PRODUCTION_SEQUENCE } from "@/lib/productionWorkflow";
import type { OrderStudentDetail, OrderStudentUniformItem } from "@/lib/production/cuttingCalculations";

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

  // 2. Concurrently fetch Requirement Items, Students, Production Record, Stage History, Order Status History, and Workflows
  const [
    { data: requirementItems },
    { data: reqStudents },
    { data: productionRecord },
    { data: stageHistory },
    { data: orderStatusHistory },
    { data: initialWorkflowsData },
    { data: inventoryMaterials },
    { data: cuttingItems },
    { data: stageItems },
    { data: checkingItems },
    { data: ironingPackingItems },
  ] = await Promise.all([
    supabase
      .from("requirement_items")
      .select("*")
      .eq("requirement_id", order.requirement_id)
      .order("class_name", { nullsFirst: true })
      .order("section_name", { nullsFirst: true })
      .order("gender", { nullsFirst: true })
      .order("item_name")
      .order("size"),
    supabase
      .from("requirement_students")
      .select(`
        student_id,
        students (
          id,
          student_name,
          admission_number,
          class_name,
          section,
          gender
        )
      `)
      .eq("requirement_id", order.requirement_id),
    supabase
      .from("production_records")
      .select("*")
      .eq("order_id", id)
      .maybeSingle(),
    supabase
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
      .order("created_at", { ascending: false }),
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("order_production_workflows")
      .select("*")
      .eq("order_id", id)
      .order("sequence_order", { ascending: true }),
    supabase
      .from("order_inventory_materials")
      .select("*")
      .eq("order_id", id),
    supabase
      .from("order_cutting_items")
      .select("*")
      .eq("order_id", id),
    supabase
      .from("order_stage_items")
      .select("*")
      .eq("order_id", id)
      .order("sequence_order", { ascending: true }),
    supabase
      .from("order_checking_items")
      .select("*")
      .eq("order_id", id),
    supabase
      .from("order_ironing_packing_items")
      .select("*")
      .eq("order_id", id),
  ]);

  let orderWorkflows = initialWorkflowsData || [];

  // If no workflows exist for this order, initialize the default 8 stages
  if (orderWorkflows.length === 0) {
    const newRows = DEFAULT_PRODUCTION_SEQUENCE.map((stage_key, idx) => ({
      order_id: id,
      stage_key,
      sequence_order: idx + 1,
      status: "pending" as const,
    }));

    const { data: seeded } = await supabase
      .from("order_production_workflows")
      .insert(newRows)
      .select("*")
      .order("sequence_order", { ascending: true });

    orderWorkflows = seeded || [];
  }

  const isWorkflowLocked =
    order.status !== "confirmed" &&
    order.status !== "submitted" &&
    order.status !== "production"
      ? true
      : orderWorkflows.some((w) => w.sequence_order >= 4 && (w.status === "in_progress" || w.status === "completed")) ||
        (!!productionRecord &&
          productionRecord.completed_quantity > 0 &&
          [
            "stitching",
            "printing",
            "embroidering",
            "checking",
            "ironing_packing",
            "production_completed",
          ].includes(productionRecord.stage));

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

  interface StudentSizeRecord {
    student_id: string;
    dynamic_sizes: unknown;
    dynamic_styles: unknown;
    shirt_size: string | null;
    pant_size: string | null;
    tshirt_size: string | null;
    short_size: string | null;
  }
  const allSizes: StudentSizeRecord[] = [];
  const configMap = new Map<string, string>();
  const styleItemMap = new Map<string, { itemName: string; styleName: string }>();

  if (studentIds.length > 0) {
    // Fetch in batches of 200 in parallel
    const chunkSize = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += chunkSize) {
      chunks.push(studentIds.slice(i, i + chunkSize));
    }

    const [chunkResults, { data: configItems }, { data: styleItems }] = await Promise.all([
      Promise.all(chunks.map(chunk =>
        supabase
          .from("student_uniform_sizes")
          .select("student_id, dynamic_sizes, dynamic_styles, shirt_size, pant_size, tshirt_size, short_size")
          .in("student_id", chunk)
      )),
      supabase
        .from("school_uniform_configuration_items")
        .select("id, item_name"),
      supabase
        .from("uniform_styles")
        .select("id, item_name, style_name"),
    ]);

    chunkResults.forEach(({ data: chunkSizes }) => {
      if (chunkSizes) {
        allSizes.push(...chunkSizes);
      }
    });

    (configItems || []).forEach((ci) => {
      configMap.set(ci.id, ci.item_name.trim().toLowerCase());
    });
    (styleItems || []).forEach((st) => {
      const cleanItem = st.item_name.trim().toLowerCase();
      configMap.set(st.id, cleanItem);
      styleItemMap.set(st.id, { itemName: st.item_name.trim(), styleName: st.style_name || "Style 1" });
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

  const classStudentCounts: Record<string, number> = {};
  (reqStudents || []).forEach((rs) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = Array.isArray(rs.students) ? rs.students[0] : (rs.students as any);
    if (s?.class_name) {
      classStudentCounts[s.class_name] = (classStudentCounts[s.class_name] || 0) + 1;
    }
  });

  const studentSizeMap = new Map<string, StudentSizeRecord>();
  allSizes.forEach((s) => {
    studentSizeMap.set(s.student_id, s);
  });

  const orderStudents: OrderStudentDetail[] = (reqStudents || []).map((rs) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = Array.isArray(rs.students) ? rs.students[0] : (rs.students as any);
    const studentId = rs.student_id;
    const studentName = s?.student_name || "Student";
    const admissionNumber = s?.admission_number || "—";
    const className = s?.class_name || "Unassigned";
    const section = s?.section || "—";
    const gender = s?.gender || "—";

    const uniforms: OrderStudentUniformItem[] = [];
    const sizeRecord = studentSizeMap.get(studentId);

    if (sizeRecord) {
      if (sizeRecord.dynamic_sizes && typeof sizeRecord.dynamic_sizes === "object") {
        const dynStyles = (sizeRecord.dynamic_styles && typeof sizeRecord.dynamic_styles === "object"
          ? sizeRecord.dynamic_styles
          : {}) as Record<string, { style_name?: string; color?: string }>;

        Object.entries(sizeRecord.dynamic_sizes as Record<string, string>).forEach(([key, val]) => {
          if (val && String(val).trim() !== "") {
            const styleMeta = dynStyles[key];
            const fallbackStyle = styleItemMap.get(key);
            const rawItemName = configMap.get(key) || fallbackStyle?.itemName || "Uniform Item";
            const itemName = rawItemName.charAt(0).toUpperCase() + rawItemName.slice(1);
            const styleName = styleMeta?.style_name || fallbackStyle?.styleName || "Style 1";
            const color = styleMeta?.color || "—";
            uniforms.push({
              itemName,
              styleName,
              color,
              size: String(val).trim(),
              quantity: 1,
            });
          }
        });
      }

      if (sizeRecord.shirt_size && String(sizeRecord.shirt_size).trim() !== "") {
        uniforms.push({
          itemName: "Shirt",
          styleName: "Standard",
          color: "—",
          size: String(sizeRecord.shirt_size).trim(),
          quantity: 1,
        });
      }
      if (sizeRecord.pant_size && String(sizeRecord.pant_size).trim() !== "") {
        uniforms.push({
          itemName: "Pant",
          styleName: "Standard",
          color: "—",
          size: String(sizeRecord.pant_size).trim(),
          quantity: 1,
        });
      }
      if (sizeRecord.tshirt_size && String(sizeRecord.tshirt_size).trim() !== "") {
        uniforms.push({
          itemName: "T-Shirt",
          styleName: "Standard",
          color: "—",
          size: String(sizeRecord.tshirt_size).trim(),
          quantity: 1,
        });
      }
      if (sizeRecord.short_size && String(sizeRecord.short_size).trim() !== "") {
        uniforms.push({
          itemName: "Short",
          styleName: "Standard",
          color: "—",
          size: String(sizeRecord.short_size).trim(),
          quantity: 1,
        });
      }
    }

    return {
      id: studentId,
      studentName,
      admissionNumber,
      className,
      section,
      gender,
      uniforms,
    };
  });

  return (
    <AdminProductionDetailsView
      key={`production-${order.id}`}
      order={formattedOrder}
      requirementItems={requirementItems || []}
      productionRecord={productionRecord || null}
      stageHistory={formattedStageHistory}
      orderStatusHistory={orderStatusHistory || []}
      totalStudents={totalStudents}
      classStudentCounts={classStudentCounts}
      dynamicItems={dynamicItems}
      orderWorkflows={orderWorkflows}
      inventoryMaterials={inventoryMaterials || []}
      cuttingItems={cuttingItems || []}
      savedStageItems={stageItems || []}
      savedCheckingItems={checkingItems || []}
      savedIroningPackingItems={ironingPackingItems || []}
      orderStudents={orderStudents}
      isWorkflowLocked={isWorkflowLocked}
    />
  );
}

