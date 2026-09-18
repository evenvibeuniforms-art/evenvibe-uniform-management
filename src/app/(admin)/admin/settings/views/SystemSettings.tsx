"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsSection } from "./SettingsSection";
import { SystemPreferences as SystemPreferencesType } from "../types";
import { updateSystemPreferences } from "../actions";
import { toast } from "sonner";
import { Loader2, Globe, Save } from "lucide-react";

interface SystemSettingsProps {
  initialData: SystemPreferencesType;
}

export function SystemSettings({ initialData }: SystemSettingsProps) {
  const [formData, setFormData] = useState<SystemPreferencesType>(initialData);
  const [loading, setLoading] = useState(false);

  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await updateSystemPreferences(formData);
      if (res.success) {
        toast.success(res.message || "System preferences updated successfully.");
      } else {
        toast.error(res.error || "Failed to update system preferences.");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsSection
      id="system"
      title="System Preferences"
      description="Configure administrative table pagination, date formatting, and regional localization."
      action={
        isDirty && (
          <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            Unsaved Changes
          </span>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Default page size */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Default Table Page Size
            </Label>
            <Select
              value={String(formData.defaultPageSize)}
              onValueChange={(val) => {
                if (val) {
                  setFormData((prev) => ({ ...prev, defaultPageSize: parseInt(val, 10) }));
                }
              }}
            >
              <SelectTrigger className="bg-slate-50 text-sm">
                <SelectValue placeholder="Select page size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 Rows per page (Default)</SelectItem>
                <SelectItem value="20">20 Rows per page</SelectItem>
                <SelectItem value="50">50 Rows per page</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Applies to Admin tables for Orders, Production, Quality Check, and Notifications.
            </p>
          </div>

          {/* Date format */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Date Display Format
            </Label>
            <Select
              value={formData.dateFormat}
              onValueChange={(val) => {
                if (val) {
                  setFormData((prev) => ({
                    ...prev,
                    dateFormat: val as SystemPreferencesType["dateFormat"],
                  }));
                }
              }}
            >
              <SelectTrigger className="bg-slate-50 text-sm">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (Indian Standard)</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO Format)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Visual formatting used in table date columns and detail cards.
            </p>
          </div>
        </div>

        {/* Timezone section */}
        <div className="rounded-lg border bg-slate-50 p-3 space-y-1.5 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-semibold text-slate-800">
                Application Timezone
              </span>
            </div>
            <span className="font-mono text-xs font-medium text-slate-700 bg-white px-2 py-0.5 rounded border">
              Asia/Kolkata (IST, UTC+5:30)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Consistent with Tamil Nadu school operations. All database timestamps are preserved in UTC
            and rendered in IST timezone.
          </p>
        </div>

        {/* Live Auto-Refresh toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold text-slate-900">
              Auto-Refresh Dashboard Tables
            </Label>
            <p className="text-xs text-slate-500">
              Periodically revalidate order and production records in the background.
            </p>
          </div>
          <Switch
            checked={formData.enableAutoRefresh}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, enableAutoRefresh: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t">
          <Button
            type="submit"
            disabled={loading || !isDirty}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
