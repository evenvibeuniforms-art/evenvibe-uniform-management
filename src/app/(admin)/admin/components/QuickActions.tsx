import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  School,
  Users,
  ShoppingBag,
  Factory,
  ClipboardCheck,
  PackageCheck,
  BarChart3,
  Zap,
} from "lucide-react";

interface ActionItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const actions: ActionItem[] = [
  {
    label: "Manage Schools",
    href: "/admin/schools",
    icon: School,
    description: "Partners & approvals",
  },
  {
    label: "Manage Students",
    href: "/admin/students",
    icon: Users,
    description: "Rosters & sizing",
  },
  {
    label: "View Orders",
    href: "/admin/orders",
    icon: ShoppingBag,
    description: "Order lifecycle",
  },
  {
    label: "Production",
    href: "/admin/production",
    icon: Factory,
    description: "Manufacturing queue",
  },
  {
    label: "Quality Check",
    href: "/admin/quality-check",
    icon: ClipboardCheck,
    description: "Inspection batches",
  },
  {
    label: "Packing & Delivery",
    href: "/admin/packing-delivery",
    icon: PackageCheck,
    description: "Dispatch & transit",
  },
  {
    label: "Reports & Analytics",
    href: "/admin/reports",
    icon: BarChart3,
    description: "Operational reports",
  },
];

export default function QuickActions() {
  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-emerald-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick Actions
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <Link
                key={act.href}
                href={act.href}
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all text-center group"
              >
                <div className="p-2 rounded-lg bg-white border border-slate-200/60 text-slate-700 group-hover:text-emerald-700 group-hover:border-emerald-200 transition-colors shadow-2xs mb-1.5">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-800 group-hover:text-emerald-900 transition-colors line-clamp-1">
                  {act.label}
                </span>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-500 transition-colors line-clamp-1">
                  {act.description}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
