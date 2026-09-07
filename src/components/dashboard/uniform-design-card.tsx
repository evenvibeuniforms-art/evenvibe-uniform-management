import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shirt, ImageIcon } from "lucide-react";

import { SchoolUniformDesign } from "@/types/database";

interface UniformDesignCardProps {
  schoolName: string;
  design: SchoolUniformDesign | null;
  signedUrl: string | null;
}

export function UniformDesignCard({ schoolName, design, signedUrl }: UniformDesignCardProps) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shirt className="h-5 w-5 text-emerald-600" />
              Uniform Design
            </CardTitle>
            <CardDescription>
              {design ? "Active approved uniform design for your school" : "Official uniform specification"}
            </CardDescription>
          </div>
          {design && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Active
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {design ? (
          <div className="space-y-4">
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
              {signedUrl ? (
                <img
                  src={signedUrl}
                  alt={`${schoolName} uniform design`}
                  className="object-contain p-2 w-full h-full"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <ImageIcon className="h-10 w-10 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-600">Image preview unavailable</p>
                </div>
              )}
            </div>

            <div className="rounded-md bg-slate-50 p-3 border border-slate-100 space-y-1">
              <div className="text-sm font-semibold text-slate-900">{design.design_name}</div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Academic Year: <strong className="text-slate-700 font-medium">{design.academic_year}</strong></span>
                {design.original_filename && (
                  <span className="truncate max-w-[160px]" title={design.original_filename}>
                    {design.original_filename}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 px-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
              <Shirt className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-medium text-slate-900">Uniform design not uploaded yet</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-xs">
              Your school uniform design will appear here once it is uploaded by EvenVibe.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
