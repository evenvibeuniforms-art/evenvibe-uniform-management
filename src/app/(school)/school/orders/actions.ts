"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export type OrderStatus = 
  | 'submitted' 
  | 'under_review' 
  | 'confirmed' 
  | 'production' 
  | 'quality_check' 
  | 'packed' 
  | 'dispatched'
  | 'in_transit' 
  | 'delivered'
  | 'cancelled';

export type OrderHistoryItem = {
  id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type RequirementItem = {
  id: string;
  class_name: string;
  section_name: string | null;
  gender: string;
  item_name: string;
  size: string;
  quantity: number;
};

export type EligibleStudent = {
  id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string | null;
  gender: string;
  is_complete: boolean;
};

export type OrderDetails = {
  id: string;
  order_number: string;
  status: OrderStatus;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  created_at: string;
  is_legacy?: boolean;
  tracking_mode?: 'legacy' | 'tracked';
  tracked_students_count?: number;
  ready_to_add_count?: number;
  can_add_students?: boolean;
  eligible_students?: EligibleStudent[];
  pending_students_count?: number;
  legacy_eligible_students?: {
    id: string;
    first_name: string;
    last_name: string;
    class_name: string;
    section: string | null;
    gender: 'male' | 'female';
  }[];
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
  alteration_requests?: {
    id: string;
    request_number: string;
    status: string;
    issue_type: string;
    created_at: string;
    uniform_type: string;
    item_type: string;
  }[];
};

export type OrderListItem = {
  id: string;
  order_number: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  requirement: {
    total_students: number;
    requirement_items: { quantity: number }[];
  };
};

export async function getOrdersList(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  dateSort?: 'desc' | 'asc';
}) {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('orders')
      .select('id, order_number, status, created_at, updated_at, requirements!inner(total_students, requirement_items(quantity))', { count: 'exact' })
      .eq('school_id', profile.school_id);

    if (params.search) {
      query = query.ilike('order_number', `%${params.search}%`);
    }

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    if (params.dateSort === 'asc') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching orders list:", error);
      return { error: "Failed to fetch orders list." };
    }

    const orders: OrderListItem[] = (data || []).map((o: unknown) => {
      const orderData = o as {
        id: string;
        order_number: string;
        status: string;
        created_at: string;
        updated_at: string;
        requirements: { total_students: number; requirement_items: { quantity: number }[] } | { total_students: number; requirement_items: { quantity: number }[] }[];
      };
      const req = Array.isArray(orderData.requirements) ? orderData.requirements[0] : orderData.requirements;
      return {
        id: orderData.id,
        order_number: orderData.order_number,
        status: orderData.status as OrderStatus,
        created_at: orderData.created_at,
        updated_at: orderData.updated_at || orderData.created_at,
        requirement: {
          total_students: req?.total_students || 0,
          requirement_items: req?.requirement_items || []
        }
      };
    });

    return { 
      orders, 
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  } catch (error) {
    console.error("Error in getOrdersList:", error);
    return { error: "An unexpected error occurred." };
  }
}

export async function getOrderDetails(orderId?: string): Promise<{ order: OrderDetails | null; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    let query = supabase
      .from("orders")
      .select("id, order_number, status, courier_name, tracking_number, estimated_delivery, created_at, requirements!inner (id, requirement_number, total_students, regular_uniform_students, tshirt_uniform_students, submitted_at, requirement_items (*)), order_status_history (*), alteration_requests (id, request_number, status, issue_type, created_at, uniform_type, item_type)")
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

    // Concurrently fetch completed sizes and eligible students
    const needsEligible = data.status === 'submitted' || data.status === 'under_review';
    
    const [trackedResult, eligibleResult] = await Promise.all([
      supabase
        .from('requirement_students')
        .select('*', { count: 'exact', head: true })
        .eq('requirement_id', requirement.id),
      needsEligible
        ? supabase.rpc('get_eligible_students_for_order', { p_order_id: data.id })
        : Promise.resolve({ data: null, error: null })
    ]);

    const completedSizes = trackedResult.count || 0;
    const pendingCount = Math.max(0, requirement.total_students - completedSizes);

    const isLegacy = false;
    const trackingMode: 'legacy' | 'tracked' = 'tracked';

    let canAddStudents = false;
    let eligibleStudents: EligibleStudent[] = [];

    if (needsEligible && !eligibleResult.error && eligibleResult.data) {
      canAddStudents = eligibleResult.data.can_add ?? false;
      eligibleStudents = (eligibleResult.data.students || []) as EligibleStudent[];
    }

    const orderDetails: OrderDetails = {
      id: data.id,
      order_number: data.order_number,
      status: data.status as OrderStatus,
      courier_name: data.courier_name,
      tracking_number: data.tracking_number,
      estimated_delivery: data.estimated_delivery,
      created_at: data.created_at,
      is_legacy: isLegacy,
      tracking_mode: trackingMode,
      legacy_eligible_students: [],
      tracked_students_count: completedSizes,
      ready_to_add_count: eligibleStudents.length,
      can_add_students: canAddStudents,
      eligible_students: eligibleStudents,
      pending_students_count: pendingCount,
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
      alteration_requests: data.alteration_requests || [],
    };

    return { order: orderDetails };
  } catch (err) {
    console.error("Error in getOrderDetails:", err);
    return { error: "An unexpected error occurred.", order: null };
  }
}

export async function getEligibleStudentsForOrder(orderId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_eligible_students_for_order', { p_order_id: orderId });
    if (error) throw error;
    return { 
      can_add: data?.can_add || false, 
      students: (data?.students || []) as EligibleStudent[],
      reason: data?.reason
    };
  } catch (err: unknown) {
    console.error("Error fetching eligible students:", err);
    return { can_add: false, students: [], error: (err as Error).message };
  }
}

export async function addStudentsToExistingOrder(orderId: string, studentIds: string[]) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('add_students_to_existing_order', { 
      p_order_id: orderId,
      p_student_ids: studentIds
    });
    if (error) throw error;
    if (data && !data.success) {
      return { error: data.error || 'Failed to add students to order' };
    }
    revalidatePath('/school/orders');
    revalidatePath(`/school/orders/${orderId}`);
    return { success: true, added_students: data.added_students };
  } catch (err: unknown) {
    console.error('Error adding students to existing order:', err);
    const errObj = err as Error;
    return { error: errObj.message || 'Failed to add students to order' };
  }
}

export async function cancelOrder(orderId: string, reason: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('cancel_order', { 
      p_order_id: orderId,
      p_reason: reason 
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${orderId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error('Error cancelling order:', error);
    const err = error as Error;
    return { error: err.message || 'Failed to cancel order' };
  }
}
