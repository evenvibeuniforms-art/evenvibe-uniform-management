"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserManagementRow } from "../types";
import { setUserActiveStatus } from "../actions";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface UserStatusDialogProps {
  user: UserManagementRow | null;
  targetAction: "activate" | "deactivate" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UserStatusDialog({
  user,
  targetAction,
  open,
  onOpenChange,
  onSuccess,
}: UserStatusDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!user || !targetAction) return null;

  const isActivating = targetAction === "activate";

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await setUserActiveStatus(user.id, isActivating);
      if (res.success) {
        toast.success(res.message || (isActivating ? "User activated" : "User deactivated"));
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res.error || "Failed to update user status.");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-full ${
                isActivating ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              {isActivating ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {isActivating
                  ? "Activate this School Admin?"
                  : "Deactivate this School Admin?"}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1">
                {isActivating
                  ? "This account will be allowed to access the School Portal."
                  : "This account will no longer be able to access the School Portal."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 border p-3 text-xs space-y-1.5 text-slate-600 my-2">
          <div>
            <span className="font-semibold text-slate-700">User:</span> {user.fullName} ({user.email})
          </div>
          <div>
            <span className="font-semibold text-slate-700">Role:</span>{" "}
            {user.role === "evenvibe_admin" ? "EvenVive Admin" : "School Admin"}
          </div>
          {user.schoolName && (
            <div>
              <span className="font-semibold text-slate-700">School:</span> {user.schoolName}{" "}
              {user.schoolCode ? `(${user.schoolCode})` : ""}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isActivating ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={loading}
            className={isActivating ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : isActivating ? (
              "Activate"
            ) : (
              "Deactivate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
