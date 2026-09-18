import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

interface DashboardKpiCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgClass?: string;
  iconColorClass?: string;
  href?: string;
  badge?: {
    text: string;
    className?: string;
  };
}

export default function DashboardKpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBgClass = "bg-emerald-50",
  iconColorClass = "text-emerald-600",
  href,
  badge,
}: DashboardKpiCardProps) {
  const content = (
    <Card className={cn(
      "border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 bg-white relative overflow-hidden",
      href && "group cursor-pointer hover:border-emerald-300"
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {title}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {value}
              </span>
              {badge && (
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                  badge.className || "bg-slate-100 text-slate-700"
                )}>
                  {badge.text}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className={cn("p-2.5 rounded-xl flex items-center justify-center shrink-0", iconBgClass)}>
              <Icon className={cn("w-5 h-5", iconColorClass)} />
            </div>
            {href && (
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-emerald-600">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
