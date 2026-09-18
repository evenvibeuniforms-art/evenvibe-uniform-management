"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./SettingsSection";
import { Shirt, ExternalLink, ShieldCheck, Database, Layers } from "lucide-react";

export function UniformSettings() {
  return (
    <SettingsSection
      id="uniforms"
      title="Uniform Configuration Reference"
      description="School-level uniform matrices, garments, class scopes, and size configurations."
      action={
        <Link href="/admin/schools">
          <Button variant="outline" size="sm" className="text-xs border-slate-300">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Manage School Uniforms
          </Button>
        </Link>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-blue-100 text-blue-700 mt-0.5">
              <Shirt className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900">
                School-Specific Configuration Model
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                EvenVive Uniforms operates on a per-school configuration architecture. Every school
                has customized uniform sets (Regular Uniform, Sports Kit, Blazers, Ties, Belts)
                partitioned by class scopes (e.g. Primary, Middle, Secondary).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80 text-xs">
            <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <Layers className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800">Class Scopes:</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Item definitions mapped to target grade levels.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <Database className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800">Size Templates:</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Standard sizes (24–42), custom sets, and free sizes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800">Historical Protection:</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Orders preserve historical snapshots upon submission.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-xs text-blue-900">
          <span>
            To configure garment items, color schemes, or size matrices for a school, open the school&apos;s uniform manager.
          </span>
          <Link href="/admin/schools">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 text-xs">
              Go to School Uniforms
            </Button>
          </Link>
        </div>
      </div>
    </SettingsSection>
  );
}
