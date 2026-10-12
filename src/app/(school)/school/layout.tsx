import Image from "next/image";
import { getCurrentUser, requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/school/SidebarNav";
import { MobileSidebar } from "@/components/school/MobileSidebar";
import { UserMenu } from "@/components/school/UserMenu";
import { SchoolNotificationBell } from "@/components/school/SchoolNotificationBell";
import { getSchoolNotifications } from "@/app/(admin)/admin/notifications/actions";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { SchoolFloatingContactButton } from "@/components/school/SchoolFloatingContactButton";

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

  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen md:h-screen w-full bg-slate-50 font-sans md:overflow-hidden print:block print:h-auto print:min-h-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:h-full md:overflow-hidden border-r border-evenvibe-deep/20 bg-evenvibe-deep text-white shrink-0 print:hidden">
        <div className="flex h-16 shrink-0 items-center px-4 lg:px-6 border-b border-white/10 gap-3">
          <Image
            src="/images/evenvibe%20logo.jpeg"
            alt="EVENVIBE Logo"
            width={120}
            height={32}
            style={{ width: "auto", height: "auto" }}
            className="h-8 w-auto object-contain rounded-md"
            priority
          />
          <div className="flex flex-col">

            <span className="text-[11px] font-medium text-emerald-300 tracking-wider uppercase leading-tight">
              School Admin
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-white/10 p-4 space-y-4 shrink-0">
          <div className="flex items-center space-x-3 px-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.email}
              </p>
              <p className="text-xs text-emerald-100/70 truncate">
                School Admin
              </p>
            </div>
          </div>
          <SignOutButton variant="ghost" className="w-full min-h-[44px] rounded-lg bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-white/30 hover:text-white" />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0 md:h-full md:overflow-hidden print:block print:overflow-visible">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-x-4 border-b bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 print:hidden">
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
        <main className="flex-1 min-w-0 md:overflow-y-auto p-4 sm:p-6 lg:p-8 print:p-0 print:m-0 print:block print:overflow-visible">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      {/* Floating Contact Button */}
      <SchoolFloatingContactButton />
    </div>
  );
}
