"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, User, LogOut, Loader2 } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { toast } from "sonner";
import { adminNavItems, isAdminRouteActive } from "./admin-nav";
import { AdminNotificationBell } from "./AdminNotificationBell";
import { AdminBusinessNotificationItem } from "@/lib/notifications/adminNotifications";

interface AdminHeaderProps {
  onLogout?: () => void;
  email?: string;
  initialNotifications?: AdminBusinessNotificationItem[];
  initialUnreadCount?: number;
}

export function AdminHeader({
  onLogout,
  email,
  initialNotifications = [],
  initialUnreadCount = 0,
}: AdminHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    if (onLogout) {
      try {
        await onLogout();
      } catch (err) {
        console.error("[AdminHeader] onLogout callback error:", err);
      }
    }
    try {
      const result = await signOutAction();
      if (result && !result.success) {
        toast.error(result.error || "Failed to sign out. Please try again.");
        setIsLoggingOut(false);
      }
    } catch (err) {
      console.error("[AdminHeader] Error during sign out:", err);
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-slate-50 px-4 lg:h-[60px] lg:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger render={
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        } />
        <SheetContent side="left" className="flex flex-col p-0 w-72 max-w-[85vw] bg-evenvibe-deep border-r-evenvibe-deep/20 text-white">
          <VisuallyHidden>
            <SheetTitle>Admin Navigation Menu</SheetTitle>
          </VisuallyHidden>
          <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-4">
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 font-bold text-xl text-white tracking-tight"
            >
              <span className="bg-evenvibe-primary text-white p-1 rounded-md shadow-sm">EV</span>
              <span>EvenVibe Admin</span>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <nav className="grid gap-1.5 px-3 text-sm font-medium">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = isAdminRouteActive(pathname, item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                      isActive ? "bg-evenvibe-primary text-white shadow-md font-semibold" : "text-emerald-100/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
      <div className="w-full flex-1">
        {/* Placeholder for future search or breadcrumbs */}
      </div>
      <div className="flex items-center gap-3">
        <AdminNotificationBell
          initialNotifications={initialNotifications}
          initialUnreadCount={initialUnreadCount}
        />
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
          <DropdownMenuItem
            disabled={isLoggingOut}
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            className="text-status-error focus:text-status-error font-medium cursor-pointer"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}

