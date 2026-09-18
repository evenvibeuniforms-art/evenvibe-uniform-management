import { OrderStatusCount } from "../../types";

interface DistributionBarChartProps {
  data: OrderStatusCount[];
  title?: string;
  subtitle?: string;
}

const STAGE_COLORS: Record<string, string> = {
  submitted: "bg-slate-400",
  under_review: "bg-amber-400",
  confirmed: "bg-blue-400",
  production: "bg-indigo-500",
  quality_check: "bg-purple-500",
  packed: "bg-teal-500",
  dispatched: "bg-cyan-500",
  in_transit: "bg-sky-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-rose-400",
};

export function DistributionBarChart({ data, title, subtitle }: DistributionBarChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalCount = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-baseline justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          <span className="text-xs font-semibold text-slate-600">Total: {totalCount}</span>
        </div>
      )}

      {/* Horizontal Distribution Bars */}
      <div className="space-y-2.5">
        {data.map((item) => {
          const widthPercent = totalCount > 0 ? (item.count / maxCount) * 100 : 0;
          const barColor = STAGE_COLORS[item.status] || "bg-slate-400";

          return (
            <div key={item.status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="text-slate-500">
                  <span className="font-bold text-slate-800">{item.count}</span> ({item.percentage}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.max(widthPercent, item.count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
