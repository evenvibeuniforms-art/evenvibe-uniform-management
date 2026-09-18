"use client";

import { useState } from "react";
import Link from "next/link";
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
import { NotificationSettings as NotificationSettingsType } from "../types";
import { updateNotificationSettings } from "../actions";
import { toast } from "sonner";
import { Loader2, ExternalLink, Save } from "lucide-react";

interface NotificationSettingsProps {
  initialData: NotificationSettingsType;
}

export function NotificationSettings({ initialData }: NotificationSettingsProps) {
  const [formData, setFormData] = useState<NotificationSettingsType>(initialData);
  const [loading, setLoading] = useState(false);

  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleToggle = (field: keyof NotificationSettingsType, val: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleRetentionChange = (val: string | null) => {
    if (val) {
      setFormData((prev) => ({
        ...prev,
        notificationRetentionDays: parseInt(val, 10),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await updateNotificationSettings(formData);
      if (res.success) {
        toast.success(res.message || "Notification preferences updated successfully.");
      } else {
        toast.error(res.error || "Failed to update notification preferences.");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsSection
      id="notifications"
      title="Notification Preferences"
      description="Control in-app notification behaviors, broadcast visibility, and retention windows."
      action={
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Unsaved Changes
            </span>
          )}
          <Link href="/admin/notifications">
            <Button variant="outline" size="sm" className="text-xs border-slate-300">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Manage Notifications
            </Button>
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3 divide-y divide-slate-100">
          {/* Enable in-app notifications */}
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-slate-900">
                In-App Notifications Channel
              </Label>
              <p className="text-xs text-slate-500">
                Allow administrators and schools to receive announcements and order status alerts.
              </p>
            </div>
            <Switch
              checked={formData.enableInAppNotifications}
              onCheckedChange={(checked) =>
                handleToggle("enableInAppNotifications", checked)
              }
            />
          </div>

          {/* Default broadcast visibility */}
          <div className="flex items-center justify-between pt-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-slate-900">
                Default Broadcast Visibility
              </Label>
              <p className="text-xs text-slate-500">
                Pre-select &apos;All Schools&apos; as default audience when creating new announcements.
              </p>
            </div>
            <Switch
              checked={formData.defaultBroadcastVisibility}
              onCheckedChange={(checked) =>
                handleToggle("defaultBroadcastVisibility", checked)
              }
            />
          </div>

          {/* Allow School Admin unread badge */}
          <div className="flex items-center justify-between pt-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-slate-900">
                School Header Unread Counter
              </Label>
              <p className="text-xs text-slate-500">
                Display the unread notification badge counter on the School Admin portal header.
              </p>
            </div>
            <Switch
              checked={formData.allowSchoolAdminUnreadBadge}
              onCheckedChange={(checked) =>
                handleToggle("allowSchoolAdminUnreadBadge", checked)
              }
            />
          </div>

          {/* Retention period */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-slate-900">
                Notification History Retention
              </Label>
              <p className="text-xs text-slate-500">
                Recommended timeline for retaining past notification records and read receipts.
              </p>
            </div>
            <div className="w-40">
              <Select
                value={String(formData.notificationRetentionDays)}
                onValueChange={handleRetentionChange}
              >
                <SelectTrigger className="bg-slate-50 text-xs">
                  <SelectValue placeholder="Select days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                  <SelectItem value="90">90 Days (Recommended)</SelectItem>
                  <SelectItem value="180">180 Days (6 Months)</SelectItem>
                  <SelectItem value="365">365 Days (1 Year)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t">
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
