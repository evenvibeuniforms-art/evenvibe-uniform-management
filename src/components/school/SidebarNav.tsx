'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, UserMinus, Ruler, ClipboardList, Package, FileSpreadsheet, Scissors, BarChart3, Settings } from "lucide-react";

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
};

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/school", icon: LayoutDashboard, active: true },
  { name: "Students", href: "/school/students", icon: Users },
  { name: "TC Students", href: "/school/tc-students", icon: UserMinus },
  { name: "Import Excel", href: "/school/import", icon: FileSpreadsheet },
  { name: "Size Management", href: "/school/sizes", icon: Ruler },
  { name: "Requirements", href: "/school/requirements", icon: ClipboardList },
  { name: "Order Status", href: "/school/orders", icon: Package },
  { name: "Alterations / Rework", href: "/school/alterations", icon: Scissors },
  { name: "Reports", href: "/school/reports", icon: BarChart3 },
  { name: "Settings", href: "/school/settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-2 py-4">
      {navigation.map((item) => {
        const isActive = pathname === item.href && !item.disabled;
        return (
          <Link
            key={item.name}
            href={item.disabled ? "#" : item.href}
            onClick={(e) => item.disabled && e.preventDefault()}
            className={cn(
              isActive
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-slate-600",
              "group flex items-center px-3 py-2 text-sm font-medium rounded-md"
            )}
            aria-disabled={item.disabled}
          >
            <item.icon
              className={cn(
                isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600",
                item.disabled && "group-hover:text-slate-400",
                "mr-3 flex-shrink-0 h-5 w-5"
              )}
              aria-hidden="true"
            />
            <span className="flex-1">{item.name}</span>
            {item.disabled && (
              <span className="ml-auto inline-block py-0.5 px-2 text-[10px] font-medium tracking-wide text-slate-500 bg-slate-100 rounded-full">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
