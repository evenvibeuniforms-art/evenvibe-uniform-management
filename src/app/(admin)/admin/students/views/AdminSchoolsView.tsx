"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, LayoutList } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type SchoolStat = {
  id: string;
  name: string;
  school_code: string;
  studentCount: number;
  activeClassesCount: number;
};

export function AdminSchoolsView({ schools }: { schools: SchoolStat[] }) {
  if (schools.length === 0) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
        <Building2 className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">No schools found</h3>
        <p className="mt-1 text-slate-500">There are currently no active schools in the system.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {schools.map((school) => (
        <Card key={school.id} className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardTitle className="text-xl font-bold truncate pr-2">{school.name}</CardTitle>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold font-mono text-slate-700">
                {school.school_code}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mt-2 space-y-3">
              <div className="flex items-center text-sm text-slate-600">
                <Users className="mr-2 h-4 w-4 text-slate-400" />
                <span className="font-medium text-slate-900 mr-1">{school.studentCount}</span> Active Students
              </div>
              <div className="flex items-center text-sm text-slate-600">
                <LayoutList className="mr-2 h-4 w-4 text-slate-400" />
                <span className="font-medium text-slate-900 mr-1">{school.activeClassesCount}</span> Classes with Students
              </div>
              
              <div className="pt-4">
                <Link
                  href={`/admin/students?school_id=${school.id}`}
                  className={buttonVariants({ variant: "default", className: "w-full" })}
                >
                  View Classes
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
