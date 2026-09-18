import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/school/SidebarNav";
import { MobileSidebar } from "@/components/school/MobileSidebar";
import { UserMenu } from "@/components/school/UserMenu";
import { SchoolNotificationBell } from "@/components/school/SchoolNotificationBell";
import { getSchoolNotifications } from "@/app/(admin)/admin/notifications/actions";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export default async function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireSchoolAdmin();
  
  // Fetch school data & notifications
  const supabase = await createClient();
  const [{ data: school }, notifsData] = await Promise.all([
    supabase.from("schools").select("name").eq("id", profile.school_id).single(),
    getSchoolNotifications(1, 10),
  ]);

  const user = (await supabase.auth.getUser()).data.user;

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r bg-white">
        <div className="flex h-16 shrink-0 items-center px-6 border-b">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            EVENVIBE <span className="text-emerald-600">UNIFORMS</span>
          </span>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t p-4 space-y-4">
          <div className="flex items-center space-x-3 px-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.email}
              </p>
              <p className="text-xs text-slate-500 truncate">
                School Admin
              </p>
            </div>
          </div>
          <form action={logout}>
            <Button variant="outline" className="w-full justify-start text-slate-600" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-x-4 border-b bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <MobileSidebar email={user?.email || ""} />
          
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold text-slate-900 hidden sm:block">School Dashboard</h1>
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <SchoolNotificationBell
                initialNotifications={notifsData.notifications}
                initialUnreadCount={notifsData.unreadCount}
              />
              <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-200" aria-hidden="true" />
              <UserMenu email={user?.email || ""} schoolName={school?.name || "School"} />
            </div>
          </div>
        </header>

        {/* Main Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
