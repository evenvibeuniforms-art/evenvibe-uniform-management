"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  School,
  Users,
  ShoppingCart,
  BarChart3,
  Factory,
  ClipboardCheck,
  Truck,
  Scissors,
  Settings,
  UserCheck,
  Bell,
} from "lucide-react";

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Schools", href: "/admin/schools", icon: School },
  { name: "Students", href: "/admin/students", icon: Users },
  { name: "User Management", href: "/admin/users", icon: UserCheck },
  { name: "Orders", href: "/admin/orders", icon: ShoppingCart },
  { name: "Production", href: "/admin/production", icon: Factory },
  { name: "Quality Check", href: "/admin/quality-check", icon: ClipboardCheck },
  { name: "Packing & Delivery", href: "/admin/packing-delivery", icon: Truck },
  { name: "Alterations / Rework", href: "/admin/alterations", icon: Scissors },
  { name: "Reports & Analytics", href: "/admin/reports", icon: BarChart3 },
  { name: "Notifications", href: "/admin/notifications", icon: Bell },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r bg-slate-50">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/admin" className="flex items-center gap-2 font-bold text-xl text-slate-900 tracking-tight">
          <span className="bg-emerald-600 text-white p-1 rounded-md">EV</span>
          <span>EvenVibe Admin</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            
            return (
              <Link
                key={item.name}
                href={item.disabled ? "#" : item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 transition-all hover:text-slate-900",
                  isActive ? "bg-slate-200 text-slate-900 font-semibold" : "hover:bg-slate-100",
                  item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-slate-500"
                )}
                onClick={(e) => item.disabled && e.preventDefault()}
              >
                <Icon className="h-4 w-4" />
                {item.name}
                {item.disabled && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
