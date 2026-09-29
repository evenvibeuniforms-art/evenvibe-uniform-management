'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserMinus,
  Ruler,
  ClipboardList,
  Package,
  FileSpreadsheet,
  Scissors,
  BarChart3,
  Settings,
  Shirt,
  PackageCheck,
} from "lucide-react";

export type SchoolNavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
};

export const schoolNavigation: SchoolNavItem[] = [
  { name: "Dashboard", href: "/school", icon: LayoutDashboard },
  { name: "Students", href: "/school/students", icon: Users },
  { name: "Received Students", href: "/school/received-students", icon: PackageCheck },
  { name: "TC Students", href: "/school/tc-students", icon: UserMinus },
  { name: "Import Excel", href: "/school/import", icon: FileSpreadsheet },
  { name: "Uniform Design", href: "/school/uniform-designs", icon: Shirt },
  { name: "Size Management", href: "/school/sizes", icon: Ruler },
  { name: "Requirements", href: "/school/requirements", icon: ClipboardList },
  { name: "Order Status", href: "/school/orders", icon: Package },
  { name: "Alterations / Rework", href: "/school/alterations", icon: Scissors },
  { name: "Reports", href: "/school/reports", icon: BarChart3 },
  { name: "Settings", href: "/school/settings", icon: Settings },
];

export function isSchoolRouteActive(pathname: string, href: string): boolean {
  if (href === "/school") {
    return pathname === "/school";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarNavProps {
  onItemClick?: () => void;
}

export function SidebarNav({ onItemClick }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1.5 px-2 py-4">
      {schoolNavigation.map((item) => {
        const isActive = isSchoolRouteActive(pathname, item.href);
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onItemClick}
            className={cn(
              isActive
                ? "bg-evenvibe-primary text-white shadow-md font-semibold"
                : "text-emerald-100/70 hover:bg-white/10 hover:text-white",
              "group flex items-center px-3 py-2.5 text-sm rounded-lg transition-all"
            )}
          >
            <item.icon
              className={cn(
                isActive ? "text-white" : "text-emerald-100/70 group-hover:text-white",
                "mr-3 flex-shrink-0 h-5 w-5"
              )}
              aria-hidden="true"
            />
            <span className="flex-1">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
