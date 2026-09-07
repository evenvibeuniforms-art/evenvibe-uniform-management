"use client";

import { StudentWithSize } from "@/app/(school)/school/sizes/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, CheckCircle2, Clock, Ruler } from "lucide-react";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";

interface SizeProgressCardsProps {
  students: StudentWithSize[];
}

export function SizeProgressCards({ students }: SizeProgressCardsProps) {
  const totalStudents = students.length;
  const completedSizes = students.filter((s) => s.size_record?.is_complete).length;
  const pendingSizes = totalStudents - completedSizes;
  const progressPercentage = totalStudents > 0 ? Math.round((completedSizes / totalStudents) * 100) : 0;

  // Regular Uniform stats
  const regularStudents = students.filter(s => s.size_record?.uniform_type === UNIFORM_TYPES.REGULAR);
  const regularCompleted = regularStudents.filter(s => s.size_record?.is_complete).length;
  const regularPending = regularStudents.length - regularCompleted;

  // T-Shirt Uniform stats
  const tshirtStudents = students.filter(s => s.size_record?.uniform_type === UNIFORM_TYPES.TSHIRT);
  const tshirtCompleted = tshirtStudents.filter(s => s.size_record?.is_complete).length;
  const tshirtPending = tshirtStudents.length - tshirtCompleted;

  // Class-wise progress
  const classStats = students.reduce((acc, student) => {
    const className = student.class_name || "Unknown";
    if (!acc[className]) {
      acc[className] = { total: 0, completed: 0 };
    }
    acc[className].total++;
    if (student.size_record?.is_complete) {
      acc[className].completed++;
    }
    return acc;
  }, {} as Record<string, { total: number; completed: number }>);

  // Sort classes numerically if possible
  const sortedClasses = Object.entries(classStats).sort((a, b) => {
    const aNum = parseInt(a[0]);
    const bNum = parseInt(b[0]);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sizes Collected</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedSizes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Sizes</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSizes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Progress</CardTitle>
            <Ruler className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{progressPercentage}%</div>
            <Progress value={progressPercentage} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Uniform Type Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Uniform Type Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <p className="font-medium text-slate-900">Regular Uniform</p>
                <p className="text-sm text-slate-500">{regularStudents.length} selected</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-emerald-600">{regularCompleted} Complete</p>
                <p className="text-sm text-amber-600">{regularPending} Pending</p>
              </div>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <p className="font-medium text-slate-900">T-Shirt Uniform</p>
                <p className="text-sm text-slate-500">{tshirtStudents.length} selected</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-emerald-600">{tshirtCompleted} Complete</p>
                <p className="text-sm text-amber-600">{tshirtPending} Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Class-wise Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Class-wise Size Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[160px] overflow-y-auto pr-2">
              {sortedClasses.map(([className, stats]) => {
                const classProgress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                return (
                  <div key={className} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Class {className}</span>
                      <span className="text-slate-500">{stats.completed} / {stats.total} ({classProgress}%)</span>
                    </div>
                    <Progress value={classProgress} className="h-2" />
                  </div>
                );
              })}
              {sortedClasses.length === 0 && (
                <p className="text-slate-500 text-sm italic">No classes found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
