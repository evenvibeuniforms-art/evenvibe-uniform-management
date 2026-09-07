"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";

export type OrderStatus = 
  | 'submitted' 
  | 'under_review' 
  | 'confirmed' 
  | 'production' 
  | 'quality_check' 
  | 'packed' 
  | 'dispatched'
  | 'in_transit' 
  | 'delivered';

export type OrderHistoryItem = {
  id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type RequirementItem = {
  id: string;
  uniform_type: string;
  item_type: string;
  size: string;
  quantity: number;
};

export type OrderDetails = {
  id: string;
  order_number: string;
  status: OrderStatus;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  created_at: string;
  requirement: {
    id: string;
    requirement_number: string;
    total_students: number;
    regular_uniform_students: number;
    tshirt_uniform_students: number;
    submitted_at: string;
  };
  history: OrderHistoryItem[];
  items: RequirementItem[];
};

export async function getOrderDetails(orderId?: string): Promise<{ order: OrderDetails | null; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    let query = supabase
      .from("orders")
      .select("id, order_number, status, courier_name, tracking_number, estimated_delivery, created_at, requirements!inner (id, requirement_number, total_students, regular_uniform_students, tshirt_uniform_students, submitted_at, requirement_items (*)), order_status_history (*)")
      .eq("school_id", profile.school_id);

    if (orderId) {
      query = query.eq("id", orderId);
    } else {
      query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { order: null };
      }
      console.error("Error fetching order details:", error);
      return { error: "Failed to fetch order details.", order: null };
    }

    const history = (data.order_status_history || []).sort(
      (a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const requirement = Array.isArray(data.requirements) ? data.requirements[0] : data.requirements;

    const orderDetails: OrderDetails = {
      id: data.id,
      order_number: data.order_number,
      status: data.status as OrderStatus,
      courier_name: data.courier_name,
      tracking_number: data.tracking_number,
      estimated_delivery: data.estimated_delivery,
      created_at: data.created_at,
      requirement: {
        id: requirement.id,
        requirement_number: requirement.requirement_number,
        total_students: requirement.total_students,
        regular_uniform_students: requirement.regular_uniform_students,
        tshirt_uniform_students: requirement.tshirt_uniform_students,
        submitted_at: requirement.submitted_at,
      },
      history: history,
      items: requirement.requirement_items || [],
    };

    return { order: orderDetails };
  } catch (err) {
    console.error("Error in getOrderDetails:", err);
    return { error: "An unexpected error occurred.", order: null };
  }
}
