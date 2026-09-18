"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageIcon, Download, ExternalLink } from "lucide-react";
import { SchoolLogo } from "@/types/database";

interface AdminSchoolLogoCardProps {
  schoolName: string;
  logo: SchoolLogo | null;
  signedUrl: string | null;
}

export function AdminSchoolLogoCard({ schoolName, logo, signedUrl }: AdminSchoolLogoCardProps) {
  const handleDownload = async () => {
    if (!signedUrl) return;
    try {
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = logo?.original_filename || `${schoolName}-school-logo`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(signedUrl, "_blank");
    }
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-600" />
              School Uniform Logo
            </CardTitle>
            <CardDescription>
              Official school uniform identity logo (managed by School Admin)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {signedUrl && logo ? (
          <div className="space-y-3">
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-white flex items-center justify-center p-4 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedUrl}
                alt={`${schoolName} school uniform logo`}
                className="object-contain w-full h-full max-h-48"
              />
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-md space-y-1 border border-slate-100">
              {logo.original_filename && (
                <p className="truncate font-medium text-slate-700" title={logo.original_filename}>
                  {logo.original_filename}
                </p>
              )}
              <p>
                Updated:{" "}
                {new Date(logo.updated_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View
                </Button>
              </a>
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Logo
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-10 px-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
              <ImageIcon className="h-6 w-6 stroke-[1.5]" />
            </div>
            <p className="text-sm font-medium text-slate-700">
              School uniform logo not uploaded yet.
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
              The school admin has not uploaded a uniform logo in their settings.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
