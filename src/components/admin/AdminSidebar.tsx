"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminNavItems, isAdminRouteActive } from "./admin-nav";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r border-evenvibe-deep/20 bg-evenvibe-deep text-white">
      <div className="flex h-14 items-center border-b border-white/10 px-4 lg:h-[60px] lg:px-6">
        <Link href="/admin" className="flex items-center gap-3 font-bold text-lg text-white tracking-tight">
          <Image
            src="/images/evenvibe%20logo.jpeg"
            alt="EVENVIBE Logo"
            width={120}
            height={32}
            style={{ width: "auto", height: "auto" }}
            className="h-8 w-auto object-contain rounded-md"
            priority
          />
          <span className="truncate">EvenVibe Admin</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide py-4">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1.5">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isAdminRouteActive(pathname, item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                  isActive ? "bg-evenvibe-primary text-white shadow-md font-semibold" : "text-emerald-100/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

