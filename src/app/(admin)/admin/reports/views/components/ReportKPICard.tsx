import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ReportKPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  badgeText?: string;
  badgeColor?: string;
}

export function ReportKPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-emerald-600",
  badgeText,
  badgeColor = "bg-slate-100 text-slate-700",
}: ReportKPICardProps) {
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {title}
          </p>
          {Icon && (
            <div className={`p-1.5 rounded-md bg-slate-50 ${iconColor}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {badgeText && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
              {badgeText}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
