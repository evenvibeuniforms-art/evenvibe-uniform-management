"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { School, User, MapPin, Phone, Mail, Calendar, Loader2 } from "lucide-react";
import { approveSchool, rejectSchool } from "@/app/(admin)/admin/schools/actions";
import { getAdminSchoolLogo, SchoolLogoResult } from "@/lib/actions/school-logo";
import { getAdminUniformDesign, ActiveUniformDesignResult } from "@/lib/actions/uniform-designs";
import { AdminSchoolLogoCard } from "./AdminSchoolLogoCard";
import { AdminUniformDesignCard } from "./AdminUniformDesignCard";
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
  const [logoState, setLogoState] = useState<{ schoolId: string | null; result: SchoolLogoResult | null }>({
    schoolId: null,
    result: null,
  });
  const [designState, setDesignState] = useState<{ schoolId: string | null; result: ActiveUniformDesignResult | null }>({
    schoolId: null,
    result: null,
  });

  const isLoadingAssets = open && !!school?.id && (logoState.schoolId !== school.id || designState.schoolId !== school.id);
  const logoData = school?.id && logoState.schoolId === school.id ? logoState.result : null;
  const designData = school?.id && designState.schoolId === school.id ? designState.result : null;

  useEffect(() => {
    let isCancelled = false;
    if (!open || !school?.id) return;

    const currentSchoolId = school.id;
    Promise.all([
      getAdminSchoolLogo(currentSchoolId),
      getAdminUniformDesign(currentSchoolId),
    ])
      .then(([logoRes, designRes]) => {
        if (!isCancelled) {
          setLogoState({ schoolId: currentSchoolId, result: logoRes });
          setDesignState({ schoolId: currentSchoolId, result: designRes });
        }
      })
      .catch((err) => {
        console.error("Failed to load school assets for admin:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [open, school?.id]);

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-2xl flex items-center gap-2">
              <School className="h-6 w-6" />
              {school.name}
            </DialogTitle>
            <Badge variant={school.is_active ? "default" : "secondary"} className={school.is_active ? "bg-emerald-500 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-600 text-white"}>
              {school.is_active ? "Active" : "Pending"}
            </Badge>
          </div>
          <DialogDescription>
            Code: {school.school_code}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium border border-red-200">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-md text-sm font-medium border border-emerald-200">
            {success}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 py-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-slate-500" />
                School Address
              </h3>
              <div className="text-sm text-slate-600 space-y-1 bg-slate-50 p-3 rounded-md">
                <p>{school.address}</p>
                <p>{school.city}, {school.district}</p>
                <p>{school.state} - {school.pincode}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                Registration Info
              </h3>
              <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md">
                <p>Created: {new Date(school.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <Phone className="h-4 w-4 text-slate-500" />
                Contact Person
              </h3>
              <div className="text-sm text-slate-600 space-y-1 bg-slate-50 p-3 rounded-md">
                <p className="font-medium text-slate-900">{school.contact_name}</p>
                <p className="flex items-center gap-2"><Mail className="h-3 w-3" /> {school.contact_email}</p>
                <p className="flex items-center gap-2"><Phone className="h-3 w-3" /> {school.contact_phone}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-slate-500" />
                School Admin Account
              </h3>
              <div className="text-sm text-slate-600 space-y-1 bg-slate-50 p-3 rounded-md">
                {adminProfile ? (
                  <>
                    <p className="font-medium text-slate-900">{adminProfile.full_name || 'No Name Provided'}</p>
                    <p>Role: <Badge variant="outline" className="text-xs">{adminProfile.role}</Badge></p>
                    <p>Status: <span className={adminProfile.is_active ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{adminProfile.is_active ? "Active" : "Inactive"}</span></p>
                  </>
                ) : (
                  <p className="italic text-slate-500">No school admin profile found.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* School Assets Section: School Uniform Logo & Uniform Design */}
        <div className="border-t border-slate-200 pt-4 pb-2">
          {isLoadingAssets ? (
            <div className="w-full h-36 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <p className="text-xs">Loading school assets...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AdminSchoolLogoCard
                schoolName={school.name}
                logo={logoData?.logo || null}
                signedUrl={logoData?.signedUrl || null}
              />
              <AdminUniformDesignCard
                schoolId={school.id}
                schoolName={school.name}
                initialDesign={designData?.design || null}
                initialSignedUrl={designData?.signedUrl || null}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleApprove}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve School
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Link href={`/admin/schools/${school.id}`}>
                <Button variant="outline">
                  View Page
                </Button>
              </Link>
              <Link href={`/admin/schools/${school.id}/uniforms`} passHref>
                <Button className="bg-slate-900 text-white hover:bg-slate-800">
                  Configure Uniforms
                </Button>
              </Link>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
