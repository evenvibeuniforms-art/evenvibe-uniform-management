"use client";

import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsSectionProps {
  id?: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: SettingsSectionProps) {
  return (
    <Card id={id} className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b bg-slate-50/75 px-6 py-4">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            {title}
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-0.5">
            {description}
          </CardDescription>
        </div>
        {action && <div>{action}</div>}
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
