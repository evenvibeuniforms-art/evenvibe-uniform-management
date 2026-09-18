"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserManagementRow } from "../types";
import {
  User,
  Mail,
  Phone,
  Shield,
  School,
  Calendar,
  Clock,
  KeyRound,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface UserDetailsDialogProps {
  user: UserManagementRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserDetailsDialog({
  user,
  open,
  onOpenChange,
}: UserDetailsDialogProps) {
  if (!user) return null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Not available";
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
      return "Not available";
    }
  };

  const isEvenViveAdmin = user.role === "evenvibe_admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
              User Details
            </DialogTitle>
            <Badge
              variant={user.isActive ? "default" : "secondary"}
              className={
                user.isActive
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }
            >
              {user.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <DialogDescription className="text-sm text-slate-500">
            Account identity, school association, and authentication metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Account Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Account Profile
            </h4>
            <div className="rounded-md border bg-slate-50 p-3.5 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Full Name
                </span>
                <span className="font-semibold text-slate-900">{user.fullName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
                <span className="font-medium text-slate-900">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </span>
                <span className="text-slate-900">{user.phone || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Role
                </span>
                <Badge
                  variant="outline"
                  className={
                    isEvenViveAdmin
                      ? "bg-purple-50 text-purple-700 border-purple-200 font-medium"
                      : "bg-blue-50 text-blue-700 border-blue-200 font-medium"
                  }
                >
                  {isEvenViveAdmin ? "EvenVive Admin" : "School Admin"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Created At
                </span>
                <span className="text-slate-700">{formatDate(user.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Last Profile Update
                </span>
                <span className="text-slate-700">{formatDate(user.updatedAt)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* School Assignment */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Assigned School
            </h4>
            <div className="rounded-md border bg-slate-50 p-3.5 space-y-2 text-sm">
              {isEvenViveAdmin ? (
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-slate-900">EvenVive Central Admin</span>
                  <span className="text-xs text-slate-500">(Not bound to a single school)</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <School className="h-3.5 w-3.5" /> School Name
                    </span>
                    <span className="font-semibold text-slate-900">
                      {user.schoolName || "Not Assigned"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      School Code
                    </span>
                    <span className="font-mono text-xs font-medium text-slate-700">
                      {user.schoolCode || "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Authentication & Security Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Authentication & Security
            </h4>
            <div className="rounded-md border bg-slate-50 p-3.5 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Password Authentication
                </span>
                <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Secured via Supabase Auth
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  Email Verification
                </span>
                {user.emailConfirmedAt ? (
                  <span className="inline-flex items-center text-xs text-emerald-700 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Confirmed
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs text-amber-700 font-medium">
                    <XCircle className="h-3.5 w-3.5 mr-1 text-amber-600" /> Unconfirmed
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Last Sign-in
                </span>
                <span className="text-slate-700 font-mono text-xs">
                  {formatDate(user.lastSignInAt)}
                </span>
              </div>
              <div className="pt-1 text-[11px] text-slate-400">
                Protected: Passwords, tokens, and secret keys are never exposed.
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
