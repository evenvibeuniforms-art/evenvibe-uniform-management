"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Search,
  Shirt,
  ArrowRight,
  MapPin,
} from "lucide-react";

export interface SchoolWithStyleCount {
  id: string;
  name: string;
  school_code: string;
  city: string | null;
  state: string | null;
  is_active: boolean;
  stylesCount: number;
}

interface UniformDesignsSchoolListProps {
  schools: SchoolWithStyleCount[];
}

export default function UniformDesignsSchoolList({ schools }: UniformDesignsSchoolListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.school_code && s.school_code.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.state && s.state.toLowerCase().includes(q))
    );
  }, [schools, searchQuery]);

  const totalStyles = useMemo(
    () => schools.reduce((acc, s) => acc + s.stylesCount, 0),
    [schools]
  );

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-evenvibe-light text-evenvibe-deep border border-emerald-200 mb-1.5">
            <Shirt className="h-3.5 w-3.5" />
            UNIFORM DESIGNS
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Select a School
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Choose a school below to view, manage, and configure its uniform styles, size options, and design specifications.
          </p>
        </div>

        {/* Quick summary badges */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge variant="outline" className="text-xs py-1 px-3 bg-white text-slate-700 border-slate-200">
            {schools.length} {schools.length === 1 ? "School" : "Schools"}
          </Badge>
          <Badge variant="outline" className="text-xs py-1 px-3 bg-white text-evenvibe-deep border-emerald-200">
            {totalStyles} Total Designs
          </Badge>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search school by name, code, or city..."
              className="pl-10 h-10 bg-slate-50 border-slate-200 text-sm focus-visible:bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Schools List Grid */}
      {filteredSchools.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-white">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <Building2 className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-lg font-medium text-slate-900">No Schools Found</p>
            <p className="text-sm mt-1 max-w-md text-slate-500">
              {searchQuery.trim()
                ? `No schools match "${searchQuery}". Try a different search term.`
                : "No schools are registered in the system yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSchools.map((school) => {
            const hasDesigns = school.stylesCount > 0;

            return (
              <Link
                key={school.id}
                href={`/admin/uniform-designs?schoolId=${school.id}`}
                className="group block focus:outline-none"
              >
                <Card className="h-full border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-emerald-400 group-focus:ring-2 group-focus:ring-emerald-500 group-focus:ring-offset-2 flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-evenvibe-light border border-emerald-100 flex items-center justify-center text-evenvibe-primary flex-shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-200">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-bold text-slate-900 text-base leading-snug truncate group-hover:text-emerald-700 transition-colors">
                            {school.name}
                          </h2>
                          {school.school_code && (
                            <span className="text-xs font-medium text-slate-400 block mt-0.5">
                              Code: {school.school_code}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status indicator */}
                      <span
                        className={`inline-block h-2 w-2 rounded-full flex-shrink-0 mt-1.5 ${
                          school.is_active ? "bg-status-success" : "bg-slate-300"
                        }`}
                        title={school.is_active ? "Active School" : "Inactive School"}
                      />
                    </div>

                    {/* Location info if available */}
                    {(school.city || school.state) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">
                          {[school.city, school.state].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-5 pt-2">
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                      <div className="flex items-center gap-1.5">
                        <Shirt className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-600">
                          {hasDesigns ? (
                            <span className="text-evenvibe-deep font-bold">
                              {school.stylesCount} {school.stylesCount === 1 ? "Design" : "Designs"}
                            </span>
                          ) : (
                            <span className="text-slate-400">0 Designs</span>
                          )}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-evenvibe-primary group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all">
                        <span>View Uniform Designs</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
