import { Metadata } from "next";
import { getRequirementPreview, submitRequirement } from "./actions";
import { getStudentSizes } from "../sizes/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, FileText, Shirt, Users } from "lucide-react";
import Link from "next/link";
import { PendingSizesTable } from "@/components/school/PendingSizesTable";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";


export const metadata: Metadata = {
  title: "Requirement Submission | EvenVibe School Admin",
  description: "Review and submit student uniform requirements.",
};

export default async function RequirementSubmissionPage() {
  const { preview, error } = await getRequirementPreview();
  const { students } = await getStudentSizes(); // Used for PendingSizesTable

  if (error || !preview) {
    return (
      <div className="p-8 text-center text-red-500">
        <AlertCircle className="mx-auto h-12 w-12 mb-4" />
        <h2 className="text-xl font-bold">Failed to load preview</h2>
        <p>{error}</p>
      </div>
    );
  }

  // Calculate totals for summary
  const totalShirts = Object.values(preview.quantities.regular.shirt).reduce((a, b) => a + b, 0);
  const totalTShirts = Object.values(preview.quantities.tshirt.tshirt).reduce((a, b) => a + b, 0);
  const totalPants = Object.values(preview.quantities.regular.pant).reduce((a, b) => a + b, 0) + 
                     Object.values(preview.quantities.tshirt.pant).reduce((a, b) => a + b, 0);
  const totalShorts = Object.values(preview.quantities.regular.short).reduce((a, b) => a + b, 0) + 
                      Object.values(preview.quantities.tshirt.short).reduce((a, b) => a + b, 0);

  const canSubmit = preview.pendingSizes === 0 && preview.totalStudents > 0;

  if (preview.hasActiveRequirement) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Requirement Submitted Successfully</h2>
          
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

          <div className="flex gap-4">
            <Link href="/school/orders">
              <Button className="bg-emerald-600 hover:bg-emerald-700">Track Order</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Requirement Submission</h1>
        <p className="text-slate-500 mt-2">
          Review your students&apos; final uniform requirement before submitting it to EvenVibe.
        </p>
      </div>

      {preview.pendingSizes > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900 leading-none tracking-tight mb-1">Action Required</h3>
            <div className="text-sm">
              You have {preview.pendingSizes} student(s) with incomplete sizes. Complete all student sizes before submitting.
            </div>
          </div>
        </div>
      )}

      {/* Top Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Students</CardTitle>
            <Users className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.totalStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Completed Sizes</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.completedSizes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Sizes</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.pendingSizes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Completion</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.completionPercentage}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Uniform Type Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Uniform Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-md">
                  <Shirt className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">Regular Uniform</h4>
                  <p className="text-sm text-slate-500">Shirt + Pant/Short</p>
                </div>
              </div>
              <div className="text-xl font-bold">{preview.regularStudents} <span className="text-sm font-normal text-slate-500">students</span></div>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-100 rounded-md">
                  <Shirt className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">T-Shirt Uniform</h4>
                  <p className="text-sm text-slate-500">T-Shirt + Pant/Short</p>
                </div>
              </div>
              <div className="text-xl font-bold">{preview.tshirtStudents} <span className="text-sm font-normal text-slate-500">students</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Class-wise Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Class-wise Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-2">
              {preview.classSummary.map(cls => (
                <div key={cls.className} className="flex items-center justify-between">
                  <div className="font-medium text-sm w-24 truncate">Class {cls.className}</div>
                  <div className="flex-1 px-4">
                    <div className="flex gap-2 items-center text-xs text-slate-500">
                      <span className="w-12 text-emerald-600">{cls.completed} done</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${(cls.completed / cls.total) * 100}%` }} />
                        <div className="bg-amber-400 h-full" style={{ width: `${(cls.pending / cls.total) * 100}%` }} />
                      </div>
                      <span className="w-12 text-amber-500">{cls.pending} pend</span>
                    </div>
                  </div>
                  <div className="font-semibold text-sm">{cls.total} <span className="text-xs text-slate-400 font-normal">total</span></div>
                </div>
              ))}
              {preview.classSummary.length === 0 && (
                <div className="text-center text-slate-500 py-4 text-sm">No classes found.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {preview.pendingSizes > 0 ? (
        <Card className="border-amber-200 shadow-sm">
          <CardHeader className="bg-amber-50/50 border-b border-amber-100">
            <CardTitle className="text-amber-800">Pending Size Collection</CardTitle>
            <CardDescription className="text-amber-700/70">
              The following students need sizes collected before submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PendingSizesTable students={students} />
          </CardContent>
        </Card>
      ) : preview.totalStudents > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quantity Summary Preview</CardTitle>
            <CardDescription>Final calculated quantities based on student sizes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Regular Sizes */}
              <div className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2 text-slate-800">Regular Uniform</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Shirts</h4>
                    <ul className="space-y-1">
                      {Object.entries(preview.quantities.regular.shirt).sort().map(([size, count]) => (
                        <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                          <span>Size {size}</span>
                          <span className="font-semibold">{count}</span>
                        </li>
                      ))}
                      {Object.keys(preview.quantities.regular.shirt).length === 0 && <li className="text-sm text-slate-400">None</li>}
                    </ul>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Pants</h4>
                      <ul className="space-y-1">
                        {Object.entries(preview.quantities.regular.pant).sort().map(([size, count]) => (
                          <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                            <span>Size {size}</span>
                            <span className="font-semibold">{count}</span>
                          </li>
                        ))}
                        {Object.keys(preview.quantities.regular.pant).length === 0 && <li className="text-sm text-slate-400">None</li>}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Shorts</h4>
                      <ul className="space-y-1">
                        {Object.entries(preview.quantities.regular.short).sort().map(([size, count]) => (
                          <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                            <span>Size {size}</span>
                            <span className="font-semibold">{count}</span>
                          </li>
                        ))}
                        {Object.keys(preview.quantities.regular.short).length === 0 && <li className="text-sm text-slate-400">None</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* T-Shirt Sizes */}
              <div className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2 text-slate-800">T-Shirt Uniform</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">T-Shirts</h4>
                    <ul className="space-y-1">
                      {Object.entries(preview.quantities.tshirt.tshirt).sort().map(([size, count]) => (
                        <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                          <span>Size {size}</span>
                          <span className="font-semibold">{count}</span>
                        </li>
                      ))}
                      {Object.keys(preview.quantities.tshirt.tshirt).length === 0 && <li className="text-sm text-slate-400">None</li>}
                    </ul>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Pants</h4>
                      <ul className="space-y-1">
                        {Object.entries(preview.quantities.tshirt.pant).sort().map(([size, count]) => (
                          <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                            <span>Size {size}</span>
                            <span className="font-semibold">{count}</span>
                          </li>
                        ))}
                        {Object.keys(preview.quantities.tshirt.pant).length === 0 && <li className="text-sm text-slate-400">None</li>}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wider">Shorts</h4>
                      <ul className="space-y-1">
                        {Object.entries(preview.quantities.tshirt.short).sort().map(([size, count]) => (
                          <li key={size} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                            <span>Size {size}</span>
                            <span className="font-semibold">{count}</span>
                          </li>
                        ))}
                        {Object.keys(preview.quantities.tshirt.short).length === 0 && <li className="text-sm text-slate-400">None</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No students found. Add students to begin.
          </CardContent>
        </Card>
      )}

      {/* Footer / Submission Section */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:pl-64 z-10 flex items-center justify-between">
        <div className="text-sm text-slate-600 hidden sm:block">
          {canSubmit 
            ? "Ready to submit requirement to EvenVibe."
            : "Complete all sizes to enable submission."
          }
        </div>
        
        <Dialog>
          <DialogTrigger disabled={!canSubmit} className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 rounded-md px-8 ${canSubmit ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 text-slate-400"}`}>
            Review & Submit Requirement
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Requirement Submission</DialogTitle>
              <DialogDescription>
                Once submitted, this requirement will be sent to EvenVibe for review and processing.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
                <div>
                  <div className="text-slate-500">Total Students</div>
                  <div className="font-bold text-lg">{preview.totalStudents}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total Items</div>
                  <div className="font-bold text-lg text-emerald-600">{totalShirts + totalTShirts + totalPants + totalShorts}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500 border-l-2 border-amber-400 pl-3">
                This action is final and will lock size changes for the current batch.
              </div>
            </div>
            <DialogFooter>
              <form action={async () => {
                "use server";
                await submitRequirement();
              }}>
                <Button type="submit" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
                  Confirm & Submit
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
