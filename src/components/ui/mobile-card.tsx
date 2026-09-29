import * as React from "react";
import { cn } from "@/lib/utils";

export function MobileCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-sm transition-all",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MobileCardField({
  label,
  value,
  children,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <div className="text-xs font-medium text-slate-500 tracking-tight">{label}</div>
      <div className="text-sm font-medium text-slate-900 leading-snug break-words">
        {value !== undefined ? value : children}
      </div>
    </div>
  );
}

export function MobileCardActions({
  label = "Actions",
  children,
  className,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between gap-2",
        className
      )}
    >
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">{children}</div>
    </div>
  );
}
