import {
  getDeliveredOrdersForAdmin,
  getReceivedStudentsForOrder,
  ClassSummary,
  DeliveredStudent,
} from "./actions";
import { ReceivedStudentsClientView } from "./ReceivedStudentsClientView";

export const metadata = {
  title: "Received Students | EvenVive Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminReceivedStudentsPage() {
  const orders = await getDeliveredOrdersForAdmin();

  let initialOrderData: { classes: ClassSummary[]; students: DeliveredStudent[] } = {
    classes: [],
    students: [],
  };

  if (orders.length > 0) {
    const data = await getReceivedStudentsForOrder(orders[0].id);
    initialOrderData = {
      classes: data.classes,
      students: data.students,
    };
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <ReceivedStudentsClientView
        orders={orders}
        initialOrderId={orders.length > 0 ? orders[0].id : undefined}
        initialOrderData={initialOrderData}
        backHref="/admin/students"
      />
    </div>
  );
}
