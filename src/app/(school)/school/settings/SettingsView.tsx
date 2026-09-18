"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  User,
  School,
  Lock,
  LogOut,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { profileSchema, passwordSchema, schoolInfoSchema, ProfileFormValues, PasswordFormValues, SchoolInfoFormValues } from "./schema";
import { updateProfile, changePassword, logoutAction, updateSchoolInfo } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileData = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  role: string;
  created_at: string;
};

type SchoolData = {
  id: string;
  name: string;
  school_code: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string;
  pincode: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
};

interface SettingsViewProps {
  profile: ProfileData;
  school: SchoolData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Profile Form ─────────────────────────────────────────────────────────────

function ProfileForm({ profile }: { profile: ProfileData }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile.full_name,
      phone: profile.phone,
    },
  });

  function onSubmit(values: ProfileFormValues) {
    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.success) {
        toast.success("Profile updated successfully.");
      } else {
        toast.error(result.error ?? "Failed to update profile.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Email — read-only */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Email Address</label>
          <Input
            id="settings-email"
            value={profile.email}
            readOnly
            disabled
            className="bg-slate-50 text-slate-500 cursor-not-allowed"
          />
          <p className="text-xs text-slate-500">
            Email address cannot be changed. Contact EvenVibe support if needed.
          </p>
        </div>

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input id="settings-full-name" placeholder="Your full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input
                  id="settings-phone"
                  placeholder="+91 98765 43210"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button
            id="settings-save-profile-btn"
            type="submit"
            disabled={isPending}
            className="min-w-[120px]"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── Password Form ────────────────────────────────────────────────────────────

function PasswordForm() {
  const [isPending, startTransition] = useTransition();

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: PasswordFormValues) {
    startTransition(async () => {
      const result = await changePassword(values);
      if (result.success) {
        toast.success("Password changed successfully.");
        form.reset();
      } else {
        toast.error(result.error ?? "Failed to change password.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input
                  id="settings-new-password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input
                  id="settings-confirm-password"
                  type="password"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button
            id="settings-change-password-btn"
            type="submit"
            variant="outline"
            disabled={isPending}
            className="min-w-[160px]"
          >
            {isPending ? "Updating…" : "Change Password"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── School Info Form ─────────────────────────────────────────────────────────

function SchoolInfoForm({ school }: { school: SchoolData }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<SchoolInfoFormValues>({
    resolver: zodResolver(schoolInfoSchema),
    defaultValues: {
      address: school.address || "",
      city: school.city || "",
      district: school.district || "",
      pincode: school.pincode || "",
      contact_name: school.contact_name || "",
      contact_phone: school.contact_phone || "",
    },
  });

  function onSubmit(values: SchoolInfoFormValues) {
    startTransition(async () => {
      const result = await updateSchoolInfo(values);
      if (result.success) {
        toast.success("School information updated successfully.");
      } else {
        toast.error(result.error ?? "Failed to update school information.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Status & Identity - Read Only */}
      <div className="space-y-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {school.is_active ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-200 gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Inactive
            </Badge>
          )}
          <span className="text-xs text-slate-500">
            Registered {formatDate(school.created_at)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">School Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={school.name}
                readOnly
                disabled
                className="pl-9 bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">School Code</label>
            <div className="relative">
              <School className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={school.school_code}
                readOnly
                disabled
                className="pl-9 bg-slate-50 text-slate-500 cursor-not-allowed font-mono"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          School identity information is managed by EvenVibe. Contact support to change these details.
        </p>
      </div>

      {/* Editable Fields */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Primary contact name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="+91 98765 43210" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address</FormLabel>
                <FormControl>
                  <Input placeholder="Building, Street, Area" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="City" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="district"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>District</FormLabel>
                  <FormControl>
                    <Input placeholder="District" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pincode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pincode</FormLabel>
                  <FormControl>
                    <Input placeholder="6 digits" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              id="settings-save-school-btn"
              type="submit"
              disabled={isPending}
              className="min-w-[120px]"
            >
              {isPending ? "Saving…" : "Save Information"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─── Logout Section ───────────────────────────────────────────────────────────

function LogoutSection({ profile }: { profile: ProfileData }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p className="text-sm text-slate-700">
          Signed in as <span className="font-medium">{profile.email}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          Account created {formatDate(profile.created_at)}
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <Button
          id="settings-logout-btn"
          variant="destructive"
          disabled={isPending}
          className="shrink-0 gap-2"
          onClick={() => setOpen(true)}
        >
          <LogOut className="h-4 w-4" />
          {isPending ? "Signing out…" : "Sign Out"}
        </Button>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign out of EvenVibe?</DialogTitle>
            <DialogDescription>
              You will be redirected to the login page. Any unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleLogout}
            >
              {isPending ? "Signing out…" : "Sign Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main SettingsView ────────────────────────────────────────────────────────

export function SettingsView({ profile, school }: SettingsViewProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your profile, view school information, and configure account security.
        </p>
      </div>

      {/* ── Profile Section ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
              <User className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-base">Your Profile</CardTitle>
              <CardDescription>Update your display name and contact number.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      {/* ── School Information ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
              <School className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">School Information</CardTitle>
              <CardDescription>Read-only. Your registered school details.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <SchoolInfoForm school={school} />
        </CardContent>
      </Card>

      {/* ── Security ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50">
              <Lock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>
                Update your account password. Use at least 8 characters.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <PasswordForm />
        </CardContent>
      </Card>

      {/* ── Session ── */}
      <Card className="border-red-100">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
              <LogOut className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-base text-red-700">Session</CardTitle>
              <CardDescription>Sign out of your EvenVibe account.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <LogoutSection profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
