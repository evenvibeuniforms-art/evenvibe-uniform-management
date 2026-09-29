import { ReactNode } from "react";
import { getCurrentUser, requireAdmin } from "@/lib/auth/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { getAdminBusinessNotifications } from "@/lib/notifications/adminNotifications";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const [user, notifsData] = await Promise.all([
    getCurrentUser(),
    getAdminBusinessNotifications(20),
  ]);

  return (
    <div className="grid min-h-screen w-full md:h-screen md:overflow-hidden md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] print:block print:min-h-0 print:h-auto print:overflow-visible">
      <aside className="hidden md:flex md:flex-col md:h-full md:overflow-hidden print:hidden">
        <AdminSidebar />
      </aside>
      <div className="flex flex-col flex-1 min-w-0 md:h-full md:overflow-hidden print:overflow-visible print:block">
        <div className="shrink-0 print:hidden">
          <AdminHeader
            email={user?.email}
            initialNotifications={notifsData.notifications}
            initialUnreadCount={notifsData.unreadCount}
          />
        </div>
        <main className="flex-1 min-w-0 md:overflow-y-auto bg-slate-50 p-3 sm:p-4 md:p-6 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
          {children}
        </main>
      </div>
    </div>
  );
}
