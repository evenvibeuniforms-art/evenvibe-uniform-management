"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { School, User, MapPin, Phone, Mail, Calendar, Loader2 } from "lucide-react";
import { approveSchool, rejectSchool } from "@/app/(admin)/admin/schools/actions";
import Link from "next/link";

interface SchoolDetails {
  id: string;
  name: string;
  school_code: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
  created_at: string;
}

interface AdminProfile {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

interface SchoolDetailsDialogProps {
  school: SchoolDetails | null;
  adminProfile?: AdminProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SchoolDetailsDialog({ school, adminProfile, open, onOpenChange }: SchoolDetailsDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!school) return null;

  const handleApprove = () => {
    setError(null);
    setSuccess(null);
    if (!confirm("Are you sure you want to approve this school and activate its admin account?")) return;

    startTransition(async () => {
      const result = await approveSchool(school.id);
      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess(result.success);
        setTimeout(() => onOpenChange(false), 2000);
      }
    });
  };

  const handleReject = () => {
    setError(null);
    setSuccess(null);
    if (!confirm("Are you sure you want to reject this registration? The record will be kept inactive.")) return;

    startTransition(async () => {
      const result = await rejectSchool(school.id);
      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess(result.success);
        setTimeout(() => onOpenChange(false), 2000);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isPending) onOpenChange(val);
      if (!val) {
        setTimeout(() => { setError(null); setSuccess(null); }, 300);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <School className="h-6 w-6 text-slate-700" />
              {school.name}
            </DialogTitle>
            <Badge variant={school.is_active ? "default" : "secondary"} className={school.is_active ? "bg-status-success hover:bg-emerald-600" : "bg-status-warning hover:bg-status-warning text-white"}>
              {school.is_active ? "Active" : "Pending"}
            </Badge>
          </div>
          <DialogDescription>
            School Code: <span className="font-mono font-medium text-slate-700">{school.school_code}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-status-error p-3 rounded-md text-sm font-medium border border-red-200">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-evenvibe-light text-evenvibe-primary p-3 rounded-md text-sm font-medium border border-emerald-200">
            {success}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 py-2">
          {/* Left Column: Address & Registration */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mb-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                School Address
              </h3>
              <div className="text-sm text-slate-600 space-y-0.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="font-medium text-slate-800">{school.address}</p>
                <p>{school.city}, {school.district}</p>
                <p>{school.state} - {school.pincode}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Registration Info
              </h3>
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p>Registered: <span className="font-medium text-slate-800">{new Date(school.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span></p>
              </div>
            </div>
          </div>

          {/* Right Column: Contact & Admin */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mb-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                Contact Person
              </h3>
              <div className="text-sm text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="font-medium text-slate-900">{school.contact_name}</p>
                <p className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-slate-400" /> {school.contact_email}</p>
                <p className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-slate-400" /> {school.contact_phone}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mb-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                School Admin Account
              </h3>
              <div className="text-sm text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                {adminProfile ? (
                  <>
                    <p className="font-medium text-slate-900">{adminProfile.full_name || 'No Name Provided'}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span>Role: <Badge variant="outline" className="text-[10px] font-medium">{adminProfile.role}</Badge></span>
                      <span>Status: <span className={adminProfile.is_active ? "text-evenvibe-primary font-semibold" : "text-status-warning font-semibold"}>{adminProfile.is_active ? "Active" : "Inactive"}</span></span>
                    </div>
                  </>
                ) : (
                  <p className="italic text-slate-500 text-xs">No school admin profile found.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
          {!school.is_active ? (
            <>
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reject Registration
              </Button>
              <Button 
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
                onClick={handleApprove}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve School
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Link href={`/admin/schools/${school.id}`}>
                <Button variant="outline">
                  View Page
                </Button>
              </Link>
              <Link href={`/admin/uniform-designs?schoolId=${school.id}`} passHref>
                <Button className="bg-slate-900 text-white hover:bg-slate-800">
                  Uniform Designs
                </Button>
              </Link>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
