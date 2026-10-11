"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { ensureOrderDeliveryStudentItems } from "@/app/(admin)/admin/packing-delivery/actions";

export interface DeliveredOrderOption {
  id: string;
  order_number: string;
  school_id: string;
  school_name?: string;
  status: string;
  delivered_at: string | null;
  created_at: string;
}

export interface DeliveredStudentItem {
  id: string;
  item_name: string;
  style_name: string | null;
  color: string | null;
  size: string;
  quantity: number;
}

export interface DeliveredStudent {
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string | null;
  gender: string | null;
  status: string;
  items: DeliveredStudentItem[];
}

export interface ClassSummary {
  class_name: string;
  total_students: number;
  received_students: number;
}

export interface ReceivedStudentsData {
  order: DeliveredOrderOption | null;
  classes: ClassSummary[];
  students: DeliveredStudent[];
}

interface SupabaseOrderRow {
  id: string;
  order_number: string;
  school_id: string;
  status: string;
  delivered_at: string | null;
  created_at: string;
  schools: { name: string } | null;
}

interface SupabaseStudentItemRow {
  id: string;
  student_id: string;
  item_name: string;
  style_name: string | null;
  color: string | null;
  size: string;
  quantity: number;
  students: {
    id: string;
    student_name: string;
    admission_number: string;
    class_name: string | null;
    section: string | null;
    gender: string | null;
  } | null;
}

/**
 * Fetch delivered orders for selection (Admin scope)
 */
export async function getDeliveredOrdersForAdmin(): Promise<DeliveredOrderOption[]> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        school_id,
        status,
        delivered_at,
        created_at,
        schools (
          name
        )
      `)
      .in("status", ["delivered", "dispatched", "in_transit", "packed"])
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching admin delivered orders:", error);
      return [];
    }

    const rows = (orders || []) as unknown as SupabaseOrderRow[];
    return rows.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      school_id: o.school_id,
      school_name: o.schools?.name || "Unknown School",
      status: o.status,
      delivered_at: o.delivered_at,
      created_at: o.created_at,
    }));
  } catch (err) {
    console.error("Error in getDeliveredOrdersForAdmin:", err);
    return [];
  }
}

/**
 * Fetch authoritative delivered students and class breakdown for an order
 */
export async function getReceivedStudentsForOrder(orderId: string): Promise<ReceivedStudentsData> {
  try {
    const supabase = await createClient();

    // 1. Fetch order details
    const { data: orderData } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        school_id,
        status,
        delivered_at,
        created_at,
        schools (
          name
        )
      `)
      .eq("id", orderId)
      .single();

    if (!orderData) {
      return { order: null, classes: [], students: [] };
    }

    const orderRow = orderData as unknown as SupabaseOrderRow;
    const order: DeliveredOrderOption = {
      id: orderRow.id,
      order_number: orderRow.order_number,
      school_id: orderRow.school_id,
      school_name: orderRow.schools?.name || "Unknown School",
      status: orderRow.status,
      delivered_at: orderRow.delivered_at,
      created_at: orderRow.created_at,
    };

    // 2. Fetch authoritative student items from order_delivery_student_items
    let { data: delItems } = await supabase
      .from("order_delivery_student_items")
      .select(`
        id,
        student_id,
        item_name,
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
          gender
        )
      `)
      .eq("order_id", orderId);

    // If empty, attempt sync RPC and fallback
    if (!delItems || delItems.length === 0) {
      try {
        await ensureOrderDeliveryStudentItems(supabase, orderId);
        const retryRes = await supabase
          .from("order_delivery_student_items")
          .select(`
            id,
            student_id,
            item_name,
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
              gender
            )
          `)
          .eq("order_id", orderId);
        delItems = retryRes.data || [];
      } catch (e) {
        console.warn("ensureOrderDeliveryStudentItems warning:", e);
      }
    }

    // 3. Map into distinct students
    const studentMap = new Map<string, DeliveredStudent>();
    const itemRows = (delItems || []) as unknown as SupabaseStudentItemRow[];

    itemRows.forEach((row) => {
      const st = row.students;
      if (!st) return;

      if (!studentMap.has(st.id)) {
        studentMap.set(st.id, {
          student_id: st.id,
          student_name: st.student_name,
          admission_number: st.admission_number,
          class_name: st.class_name || "Unassigned",
          section: st.section,
          gender: st.gender,
          status: "✓ Dress Received",
          items: [],
        });
      }

      studentMap.get(st.id)!.items.push({
        id: row.id,
        item_name: row.item_name,
        style_name: row.style_name,
        color: row.color,
        size: row.size,
        quantity: row.quantity || 1,
      });
    });

    const students = Array.from(studentMap.values()).sort((a, b) =>
      a.student_name.localeCompare(b.student_name)
    );

    // 4. Group by class
    const classMap = new Map<string, { total: number; received: number }>();
    students.forEach((st) => {
      const cls = st.class_name;
      const cur = classMap.get(cls) || { total: 0, received: 0 };
      cur.total += 1;
      cur.received += 1;
      classMap.set(cls, cur);
    });

    const classes: ClassSummary[] = Array.from(classMap.entries())
      .map(([class_name, stats]) => ({
        class_name,
        total_students: stats.total,
        received_students: stats.received,
      }))
      .sort((a, b) => a.class_name.localeCompare(b.class_name, undefined, { numeric: true }));

    return {
      order,
      classes,
      students,
    };
  } catch (err) {
    console.error("Error in getReceivedStudentsForOrder:", err);
    return { order: null, classes: [], students: [] };
  }
}
