import { ReactNode } from "react";
import { getCurrentUser, requireAdmin } from "@/lib/auth/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const user = await getCurrentUser();

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden md:block">
        <AdminSidebar />
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminHeader email={user?.email} />
        <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
