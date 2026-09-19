"use client";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function MobileSidebar({ email }: { email: string }) {
  return (
    <Sheet>
      <SheetTrigger className="md:hidden p-2 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-700">
        <Menu className="h-6 w-6" />
        <span className="sr-only">Open sidebar</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
        </VisuallyHidden>
        <div className="flex h-16 shrink-0 items-center px-6 border-b">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            EVENVIBE <span className="text-emerald-600">UNIFORMS</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t p-4 space-y-4">
          <div className="px-2">
            <p className="text-sm font-medium text-slate-900 truncate">{email}</p>
            <p className="text-xs text-slate-500">School Admin</p>
          </div>
          <SignOutButton className="w-full text-slate-600" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
