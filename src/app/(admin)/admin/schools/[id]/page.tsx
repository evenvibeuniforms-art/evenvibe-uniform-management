import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSchoolLogo } from "@/lib/actions/school-logo";
import { getAdminUniformDesign } from "@/lib/actions/uniform-designs";
import { AdminSchoolLogoCard } from "@/components/admin/schools/AdminSchoolLogoCard";
import { AdminUniformDesignCard } from "@/components/admin/schools/AdminUniformDesignCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { School, MapPin, Phone, Mail, Calendar, User, ChevronLeft, Shirt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "School Details | EvenVibe Admin",
};

export default async function AdminSchoolDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: schoolId } = await params;

  // Validate UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(schoolId)) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch school details
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("*")
    .eq("id", schoolId)
    .single();

  if (schoolError || !school) {
    notFound();
  }

  // Fetch admin profile
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("school_id", schoolId)
    .eq("role", "school_admin")
    .maybeSingle();

  // Fetch school uniform logo and uniform design in parallel
  const [logoResult, designResult] = await Promise.all([
    getAdminSchoolLogo(schoolId),
    getAdminUniformDesign(schoolId),
  ]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/schools"
            className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <School className="h-7 w-7 text-slate-700" />
                {school.name}
              </h1>
              <Badge
                variant={school.is_active ? "default" : "secondary"}
                className={
                  school.is_active
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                }
              >
                {school.is_active ? "Active" : "Pending"}
              </Badge>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              School Code: <span className="font-mono font-medium text-slate-700">{school.school_code}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/admin/schools/${school.id}/uniforms`}>
            <Button className="bg-slate-900 text-white hover:bg-slate-800">
              <Shirt className="h-4 w-4 mr-2" />
              Configure Uniforms
            </Button>
          </Link>
        </div>
      </div>

      {/* School Information Card */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">
            School Information
          </CardTitle>
          <CardDescription>
            Registration and contact records for {school.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 bg-slate-50 p-3 rounded-md">
              <h4 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Address
              </h4>
              <p className="text-sm font-medium text-slate-900 mt-1">{school.address}</p>
              <p className="text-sm text-slate-600">
                {school.city}, {school.district}
              </p>
              <p className="text-sm text-slate-600">
                {school.state} - {school.pincode}
              </p>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-md">
              <h4 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Contact Information
              </h4>
              <p className="text-sm font-medium text-slate-900 mt-1">{school.contact_name}</p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {school.contact_email}
              </p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                {school.contact_phone}
              </p>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-md">
              <h4 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Registration Date
              </h4>
              <p className="text-sm text-slate-700 mt-1">
                {new Date(school.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-md">
              <h4 className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                School Admin Account
              </h4>
              {adminProfile ? (
                <div className="mt-1">
                  <p className="text-sm font-medium text-slate-900">
                    {adminProfile.full_name || "No Name Provided"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {adminProfile.role}
                    </Badge>
                    <span
                      className={`text-xs font-medium ${
                        adminProfile.is_active ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {adminProfile.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-slate-500 mt-1">
                  No school admin profile found.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visually separate sections for School Uniform Logo and Uniform Design */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: School Uniform Logo (View + Download) */}
        <div>
          <AdminSchoolLogoCard
            schoolName={school.name}
            logo={logoResult.logo}
            signedUrl={logoResult.signedUrl}
          />
        </div>

        {/* Section 2: School Uniform Design (Upload + Change + Delete + Download) */}
        <div>
          <AdminUniformDesignCard
            schoolId={school.id}
            schoolName={school.name}
            initialDesign={designResult.design}
            initialSignedUrl={designResult.signedUrl}
          />
        </div>
      </div>
    </div>
  );
}
