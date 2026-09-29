import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ReceivedStudentsClientView } from "@/app/(admin)/admin/students/received/ReceivedStudentsClientView";
import {
  getReceivedStudentsForOrder,
  ClassSummary,
  DeliveredStudent,
} from "@/app/(admin)/admin/students/received/actions";

export const metadata = {
  title: "Received Students | School Admin",
};

export const dynamic = "force-dynamic";

interface SchoolOrderRow {
  id: string;
  order_number: string;
  school_id: string;
  status: string;
  delivered_at: string | null;
  created_at: string;
  schools: { name: string } | null;
}

export default async function SchoolReceivedStudentsPage() {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: orders } = await supabase
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
    .eq("school_id", profile.school_id)
    .in("status", ["delivered", "dispatched", "in_transit", "packed"])
    .order("delivered_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const orderRows = (orders || []) as unknown as SchoolOrderRow[];
  const mappedOrders = orderRows.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    school_id: o.school_id,
    school_name: o.schools?.name || "My School",
    status: o.status,
    delivered_at: o.delivered_at,
    created_at: o.created_at,
  }));

  let initialOrderData: { classes: ClassSummary[]; students: DeliveredStudent[] } = {
    classes: [],
    students: [],
  };

  if (mappedOrders.length > 0) {
    const data = await getReceivedStudentsForOrder(mappedOrders[0].id);
    initialOrderData = {
      classes: data.classes,
      students: data.students,
    };
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <ReceivedStudentsClientView
        orders={mappedOrders}
        initialOrderId={mappedOrders.length > 0 ? mappedOrders[0].id : undefined}
        initialOrderData={initialOrderData}
        backHref="/school/students"
      />
    </div>
  );
}
