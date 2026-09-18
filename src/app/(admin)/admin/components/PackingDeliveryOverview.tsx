import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PackingDeliveryOverviewData } from "../types";
import { ArrowRight, Box, CheckCircle2, Clock, PackageCheck, Truck } from "lucide-react";

interface PackingDeliveryOverviewProps {
  data: PackingDeliveryOverviewData;
}

export default function PackingDeliveryOverview({ data }: PackingDeliveryOverviewProps) {
  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-teal-600" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Packing & Delivery
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Boxing, dispatch staging & logistics
            </CardDescription>
          </div>
          <Link
            href="/admin/packing-delivery"
            className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center gap-0.5 hover:underline"
          >
            Details
            <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>

        <CardContent className="pt-4 space-y-2.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <Box className="w-3.5 h-3.5 text-slate-500" />
                Packing Pending
              </div>
              <span className="text-sm font-bold text-slate-900">
                {data.packingPending}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-teal-50/50 border border-teal-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-800">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                Packing In Progress
              </div>
              <span className="text-sm font-bold text-slate-900">
                {data.packingInProgress}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-50/50 border border-cyan-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-800">
                <PackageCheck className="w-3.5 h-3.5 text-cyan-600" />
                Ready for Dispatch (Packed)
              </div>
              <span className="text-sm font-bold text-slate-900">
                {data.readyForDispatch}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50/50 border border-orange-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-orange-800">
                <Truck className="w-3.5 h-3.5 text-orange-600" />
                In Transit (Dispatched)
              </div>
              <span className="text-sm font-bold text-slate-900">
                {data.inTransit}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Delivered
              </div>
              <span className="text-sm font-bold text-slate-900">
                {data.delivered}
              </span>
            </div>
          </div>
        </CardContent>
      </div>

      <div className="p-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs">
        <span className="text-slate-500">Logistics status</span>
        <Link
          href="/admin/packing-delivery"
          className="text-teal-700 font-medium hover:underline inline-flex items-center gap-1"
        >
          Open Logistics
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}
