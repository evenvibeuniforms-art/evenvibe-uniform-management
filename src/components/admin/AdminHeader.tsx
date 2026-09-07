"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, User, LayoutDashboard, School, Users, ShoppingCart, BarChart, Factory, Settings } from "lucide-react";

interface AdminHeaderProps {
  onLogout: () => void;
  email?: string;
}

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Schools", href: "/admin/schools", icon: School },
  { name: "Students", href: "/admin/students", icon: Users, disabled: true },
  { name: "Orders", href: "/admin/orders", icon: ShoppingCart, disabled: true },
  { name: "Reports", href: "/admin/reports", icon: BarChart, disabled: true },
  { name: "Production", href: "/admin/production", icon: Factory, disabled: true },
  { name: "Settings", href: "/admin/settings", icon: Settings, disabled: true },
];

export function AdminHeader({ onLogout, email }: AdminHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-slate-50 px-4 lg:h-[60px] lg:px-6">
      <Sheet>
        <SheetTrigger render={
          <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        } />
        <SheetContent side="left" className="flex flex-col p-0 w-72">
          <div className="flex h-14 items-center border-b px-4">
            <Link href="/admin" className="flex items-center gap-2 font-bold text-xl text-slate-900 tracking-tight">
              <span className="bg-emerald-600 text-white p-1 rounded-md">EV</span>
              <span>EvenVibe Admin</span>
            </Link>
          </div>
          <nav className="grid gap-2 p-4 text-sm font-medium">
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
                  <Icon className="h-5 w-5" />
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
        </SheetContent>
      </Sheet>
      <div className="w-full flex-1">
        {/* Placeholder for future search or breadcrumbs */}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="secondary" size="icon" className="rounded-full">
            <User className="h-5 w-5" />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        } />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            {email && (
              <DropdownMenuLabel className="font-normal text-xs text-slate-500 truncate max-w-[200px]">
                {email}
              </DropdownMenuLabel>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-red-600 focus:text-red-600 font-medium cursor-pointer">
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
