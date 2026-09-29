import {
  LayoutDashboard,
  School,
  Users,
  UserCheck,
  ShoppingCart,
  Factory,
  ClipboardCheck,
  Truck,
  Scissors,
  BarChart3,
  Bell,
  Settings,
  Shirt,
  CalendarClock,
  UserMinus,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Single source of truth for EvenVive Admin navigation across desktop and mobile.
 */
export const adminNavItems: AdminNavItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Schools", href: "/admin/schools", icon: School },
  { name: "Uniform Designs", href: "/admin/uniform-designs", icon: Shirt },
  { name: "Students", href: "/admin/students", icon: Users },
  { name: "Received Students", href: "/admin/students/received", icon: PackageCheck },
  { name: "TC Students", href: "/admin/tc-students", icon: UserMinus },
  { name: "User Management", href: "/admin/users", icon: UserCheck },
  { name: "Orders", href: "/admin/orders", icon: ShoppingCart },
  { name: "Production", href: "/admin/production", icon: Factory },
  { name: "Academic Size History", href: "/admin/academic-size-history", icon: CalendarClock },
  { name: "Quality Check", href: "/admin/quality-check", icon: ClipboardCheck },
  { name: "Delivery", href: "/admin/packing-delivery", icon: Truck },
  { name: "Alterations / Rework", href: "/admin/alterations", icon: Scissors },
  { name: "Reports & Analytics", href: "/admin/reports", icon: BarChart3 },
  { name: "Notifications", href: "/admin/notifications", icon: Bell },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

/**
 * Helper to determine if a route is currently active.
 * Handles exact match for "/admin" so Dashboard isn't highlighted on sub-routes.
 */
export function isAdminRouteActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  if (href === "/admin/students") {
    return pathname === "/admin/students" || 
           (pathname.startsWith("/admin/students/") && !pathname.startsWith("/admin/students/received"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
