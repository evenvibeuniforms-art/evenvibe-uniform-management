"use client";

import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "./SettingsSection";
import { OrderStatusItem } from "../types";
import {
  FileText,
  Search,
  CheckCircle,
  Factory,
  ClipboardCheck,
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from "lucide-react";

interface OrderSettingsProps {
  orderStatuses: OrderStatusItem[];
}

export function OrderSettings({ orderStatuses }: OrderSettingsProps) {
  const getStatusIcon = (key: string) => {
    switch (key) {
      case "submitted":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "under_review":
        return <Search className="h-4 w-4 text-amber-600" />;
      case "confirmed":
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case "production":
        return <Factory className="h-4 w-4 text-indigo-600" />;
      case "quality_check":
        return <ClipboardCheck className="h-4 w-4 text-purple-600" />;
      case "packed":
        return <Package className="h-4 w-4 text-cyan-600" />;
      case "dispatched":
        return <Truck className="h-4 w-4 text-orange-600" />;
      case "in_transit":
        return <MapPin className="h-4 w-4 text-sky-600" />;
      case "delivered":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-rose-600" />;
      default:
        return <FileText className="h-4 w-4 text-slate-600" />;
    }
  };

  return (
    <SettingsSection
      id="orders"
      title="Order Lifecycle & Status Rules"
      description="Read-only definition of core business states, phase transitions, and cancellation boundaries."
      action={
        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
          Enforced by State Machine
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* Notice alert */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Order lifecycle statuses are core business rules. Modifying or deleting stages is
            restricted to ensure complete data consistency across Production, Quality Check,
            Packing, Logistics, and School Portals.
          </p>
        </div>

        {/* 10-stage visual workflow */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orderStatuses.map((stage, idx) => (
            <div
              key={stage.key}
              className="rounded-lg border bg-slate-50/50 p-3 flex flex-col justify-between space-y-2 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-white border border-slate-200 shadow-2xs">
                    {getStatusIcon(stage.key)}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-xs">
                      {idx + 1}. {stage.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 ml-1.5">
                      ({stage.key})
                    </span>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={
                    stage.cancellationAllowed
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                      : "bg-slate-100 text-slate-500 border-slate-200 text-[10px]"
                  }
                >
                  {stage.cancellationAllowed ? "Cancellable" : "Locked"}
                </Badge>
              </div>

              <p className="text-xs text-slate-600 leading-normal pl-8">
                {stage.description}
              </p>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-400 pl-8">
                <span>Phase: {stage.phase}</span>
                <span>
                  {stage.cancellationAllowed
                    ? "Allowed before production"
                    : "No cancellation after manufacturing starts"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}
