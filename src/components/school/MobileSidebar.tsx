"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function MobileSidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="md:hidden p-2 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-700">
        <Menu className="h-6 w-6" />
        <span className="sr-only">Open sidebar</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col bg-evenvibe-deep border-r-evenvibe-deep/20 text-white">
        <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
        </VisuallyHidden>
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/10">
          <span className="text-lg font-bold tracking-tight text-white">
            EVENVIBE <span className="text-emerald-300">UNIFORMS</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav onItemClick={() => setOpen(false)} />
        </div>
        <div className="border-t border-white/10 p-4 space-y-4">
          <div className="px-2">
            <p className="text-sm font-medium text-white truncate">{email}</p>
            <p className="text-xs text-emerald-100/70">School Admin</p>
          </div>
          <SignOutButton variant="ghost" className="w-full min-h-[44px] rounded-lg bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-white/30 hover:text-white" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
