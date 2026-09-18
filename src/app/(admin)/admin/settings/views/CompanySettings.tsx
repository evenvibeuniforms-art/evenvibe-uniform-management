"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "./SettingsSection";
import { CompanySettings as CompanySettingsType } from "../types";
import { updateCompanySettings } from "../actions";
import { toast } from "sonner";
import { Loader2, Building2, Save } from "lucide-react";

interface CompanySettingsProps {
  initialData: CompanySettingsType;
}

export function CompanySettings({ initialData }: CompanySettingsProps) {
  const [formData, setFormData] = useState<CompanySettingsType>(initialData);
  const [loading, setLoading] = useState(false);

  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleChange = (field: keyof CompanySettingsType, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await updateCompanySettings(formData);
      if (res.success) {
        toast.success(res.message || "Company information updated successfully.");
      } else {
        toast.error(res.error || "Failed to update company information.");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsSection
      id="company"
      title="Company Information"
      description="Official business identity, contact details, and registered address."
      action={
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Unsaved Changes
            </span>
          )}
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName" className="text-xs font-semibold text-slate-700">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                placeholder="EvenVive Uniforms"
                className="pl-9 bg-slate-50 text-sm"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website" className="text-xs font-semibold text-slate-700">
              Website URL
            </Label>
            <Input
              id="website"
              value={formData.website}
              onChange={(e) => handleChange("website", e.target.value)}
              placeholder="https://evenvibeuniforms.art"
              className="bg-slate-50 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
              Contact Email
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="contact@evenvibeuniforms.art"
              className="bg-slate-50 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">
              Contact Phone
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+91 98765 43210"
              className="bg-slate-50 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t">
          <Label htmlFor="address" className="text-xs font-semibold text-slate-700">
            Registered Address
          </Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="123 Industrial Estate, Guindy"
            className="bg-slate-50 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="city" className="text-xs font-semibold text-slate-700">
              City
            </Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => handleChange("city", e.target.value)}
              placeholder="Chennai"
              className="bg-slate-50 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state" className="text-xs font-semibold text-slate-700">
              State
            </Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => handleChange("state", e.target.value)}
              placeholder="Tamil Nadu"
              className="bg-slate-50 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pincode" className="text-xs font-semibold text-slate-700">
              Pincode
            </Label>
            <Input
              id="pincode"
              value={formData.pincode}
              onChange={(e) => handleChange("pincode", e.target.value)}
              placeholder="600032"
              className="bg-slate-50 text-sm"
              maxLength={6}
            />
          </div>
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
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
