"use client";

import { useState } from "react";
import { AdminSettingsData } from "../types";
import { CompanySettings } from "./CompanySettings";
import { UniformSettings } from "./UniformSettings";
import { OrderSettings } from "./OrderSettings";
import { NotificationSettings } from "./NotificationSettings";
import { SystemSettings } from "./SystemSettings";
import {
  Building2,
  Shirt,
  ShoppingCart,
  Bell,
  Sliders,
  Clock,
} from "lucide-react";

interface AdminSettingsViewProps {
  initialData: AdminSettingsData;
}

export function AdminSettingsView({ initialData }: AdminSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<
    "all" | "company" | "uniforms" | "orders" | "notifications" | "system"
  >("all");

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const formattedUpdate = formatDate(initialData.updatedAt);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Settings & Configuration
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage EvenVive system preferences, company information, and operational configuration.
          </p>
        </div>

        {formattedUpdate && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border px-3 py-1.5 rounded-lg shrink-0">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Last updated: {formattedUpdate}</span>
          </div>
        )}
      </div>

      {/* Navigation Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "all"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All Settings
        </button>

        <button
          onClick={() => setActiveTab("company")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "company"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Company Info
        </button>

        <button
          onClick={() => setActiveTab("uniforms")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "uniforms"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Shirt className="h-3.5 w-3.5" />
          Uniform Reference
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "orders"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Order Lifecycle
        </button>

        <button
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "notifications"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
          Notifications
        </button>

        <button
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === "system"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Preferences
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {(activeTab === "all" || activeTab === "company") && (
          <CompanySettings initialData={initialData.company} />
        )}

        {(activeTab === "all" || activeTab === "uniforms") && (
          <UniformSettings />
        )}

        {(activeTab === "all" || activeTab === "orders") && (
          <OrderSettings orderStatuses={initialData.orderStatuses} />
        )}

        {(activeTab === "all" || activeTab === "notifications") && (
          <NotificationSettings initialData={initialData.notifications} />
        )}

        {(activeTab === "all" || activeTab === "system") && (
          <SystemSettings initialData={initialData.preferences} />
        )}
      </div>
    </div>
  );
}
