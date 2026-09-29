import { Metadata } from "next";
import { getRequirementPreview } from "./actions";
import { getStudentSizes } from "../sizes/actions";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { RequirementStudentSelectionView } from "@/components/school/RequirementStudentSelectionView";
import { RequirementRealtimeListener } from "@/components/school/RequirementRealtimeListener";

export const metadata: Metadata = {
  title: "Requirement Submission | EvenVibe School Admin",
  description: "Review and submit student uniform requirements.",
};

export const dynamic = "force-dynamic";

export default async function RequirementSubmissionPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const isCreateMode = resolvedParams.new === "true";

  const [
    { preview, error },
    { students, allConfigs: configurations }
  ] = await Promise.all([
    getRequirementPreview(),
    getStudentSizes(),
  ]);

  if (error || !preview) {
    return (
      <div className="p-8 text-center text-status-error">
        <AlertCircle className="mx-auto h-12 w-12 mb-4" />
        <h2 className="text-xl font-bold">Failed to load preview</h2>
        <p>{error}</p>
      </div>
    );
  }

  // If there's an active requirement/order and the user is NOT explicitly creating a new requirement
  if (preview.hasActiveRequirement && !isCreateMode) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <RequirementRealtimeListener />
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <div className="w-16 h-16 bg-emerald-100 text-evenvibe-primary rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Requirement Submitted Successfully</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-2">
            Your requirement and order have been submitted. You can track progress or submit another independent order at any time.
          </p>
          
          <div className="bg-slate-50 border rounded-lg p-6 max-w-sm w-full my-6 space-y-4 text-left">
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Requirement No</div>
              <div className="font-semibold text-slate-900">{preview.activeRequirementNumber}</div>
            </div>
            {preview.activeOrderNumber && (
              <div>
                <div className="text-sm font-medium text-slate-500 mb-1">Order No</div>
                <div className="font-semibold text-slate-900">{preview.activeOrderNumber}</div>
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 capitalize">
                {preview.activeRequirementStatus?.replace("_", " ")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/school/orders">
              <Button className="bg-evenvibe-primary hover:bg-evenvibe-deep">Track Order</Button>
            </Link>
            <Link href="/school/requirements?new=true">
              <Button variant="outline" className="border-evenvibe-primary text-evenvibe-deep hover:bg-emerald-50">
                Create / Submit New Requirement
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RequirementRealtimeListener />
      <RequirementStudentSelectionView
        students={students}
        configurations={configurations}
        activeOrdersCount={preview.activeOrdersCount}
        latestActiveOrderNumber={preview.activeOrderNumber}
        latestActiveOrderStatus={preview.activeRequirementStatus}
      />
    </div>
  );
}

