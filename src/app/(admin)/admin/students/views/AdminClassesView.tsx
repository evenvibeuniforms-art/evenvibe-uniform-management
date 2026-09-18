"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type ClassStat = {
  className: string;
  studentCount: number;
};

export function AdminClassesView({ schoolId, schoolName, classes }: { schoolId: string, schoolName: string, classes: ClassStat[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Link 
          href="/admin/students" 
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Schools
        </Link>
      </div>
      
      <div className="flex items-center text-sm text-slate-500 font-medium mb-6">
        <span>Manage Students</span>
        <span className="mx-2">/</span>
        <span className="text-slate-900">{schoolName}</span>
      </div>

      {classes.length === 0 ? (
        <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No classes found</h3>
          <p className="mt-1 text-slate-500">There are no classes with active students in this school.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {classes.map((cls) => (
            <Card key={cls.className} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold truncate">{cls.className}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mt-2 space-y-4">
                  <div className="flex items-center text-sm text-slate-600">
                    <Users className="mr-2 h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900 mr-1">{cls.studentCount}</span> Students
                  </div>
                  
                  <div className="pt-2">
                    <Link
                      href={`/admin/students?school_id=${schoolId}&class_name=${encodeURIComponent(cls.className)}`}
                      className={buttonVariants({ variant: "outline", className: "w-full" })}
                    >
                      View Students
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
