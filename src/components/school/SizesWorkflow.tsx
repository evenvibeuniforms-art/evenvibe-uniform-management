"use client";
import { ConfigItem } from "@/app/(school)/school/sizes/actions";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

import { useState, useMemo } from "react";
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";
import { StudentWithSize } from "@/app/(school)/school/sizes/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Ruler, CheckCircle2, Clock } from "lucide-react";
import { SizeCollectionTable } from "./SizeCollectionTable";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingSizesTable } from "./PendingSizesTable";

interface SizesWorkflowProps {
  students: StudentWithSize[];
  allConfigs: { gender: string; classes: string[]; items: ConfigItem[] }[];
}

export function SizesWorkflow({ students, allConfigs }: SizesWorkflowProps) {
  useRealtimeRefresh({ table: "students" });

  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // Derive unique classes, ignoring nulls/empty
  const classes = useMemo(() => {
    const classSet = new Set(students.map(s => s.class_name).filter(Boolean));
    
    const getSortIndex = (c: string) => {
      const idx = STANDARD_CLASSES.indexOf(c);
      if (idx !== -1) return idx;
      return 999;
    };

    return Array.from(classSet).sort((a, b) => {
      const idxA = getSortIndex(a);
      const idxB = getSortIndex(b);
      
      if (idxA === 999 && idxB === 999) return a.localeCompare(b);
      return idxA - idxB;
    });
  }, [students]);

  // Derive unique sections for selected class
  const sections = useMemo(() => {
    if (!selectedClass) return [];
    const classStudents = students.filter(s => s.class_name === selectedClass);
    const sectionSet = new Set(classStudents.map(s => s.section).filter(Boolean));
    return Array.from(sectionSet).sort();
  }, [students, selectedClass]);

  // Filter students for selected class and section
  const filteredStudents = useMemo(() => {
    if (!selectedClass || !selectedSection) return [];
    return students.filter(
      s => s.class_name === selectedClass && s.section === selectedSection
    );
  }, [students, selectedClass, selectedSection]);

  // Resolve configuration for the selected class
  const configurations = useMemo(() => {
    return allConfigs.filter(c => c.classes.includes(selectedClass || ""));
  }, [allConfigs, selectedClass]);

  // Progress calculations
  const total = filteredStudents.length;
  const completed = filteredStudents.filter(s => s.size_record?.is_complete).length;
  const pending = total - completed;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // View 1: Select Class
  if (!selectedClass) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Select Class</h2>
          <p className="text-slate-500 mt-1">Choose a class to start collecting uniform sizes.</p>
        </div>
        {classes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-slate-500">
              <Ruler className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-lg font-medium text-slate-900">No classes found</p>
              <p>Add students to see classes here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {classes.map(c => {
              // Exact string matching as requested, no fragile parsing
              const isStandardNumberedClass = c.startsWith('Class ') && !isNaN(Number(c.replace('Class ', '')));
              const classNumber = isStandardNumberedClass ? c.replace('Class ', '') : c;
              
              return (
                <Button
                  key={c}
                  variant="outline"
                  className="h-24 text-lg font-medium flex flex-col gap-2 hover:border-emerald-500 hover:text-emerald-600 transition-colors bg-white shadow-sm"
                  onClick={() => setSelectedClass(c)}
                >
                  {isStandardNumberedClass ? (
                    <>
                      <span>Class</span>
                      <span className="text-2xl font-bold">{classNumber}</span>
                    </>
                  ) : (
                    <span className="text-xl font-bold">{c}</span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 2: Select Section
  if (!selectedSection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedClass(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Class {selectedClass} - Select Section</h2>
            <p className="text-slate-500 mt-1">Choose a section to view students.</p>
          </div>
        </div>
        
        {sections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-slate-500">
              <Users className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-lg font-medium text-slate-900">No sections found</p>
              <p>Add students with sections to this class.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {sections.map(s => (
              <Button
                key={s}
                variant="outline"
                className="h-24 text-lg font-medium flex flex-col gap-2 hover:border-emerald-500 hover:text-emerald-600 transition-colors bg-white shadow-sm"
                onClick={() => setSelectedSection(s)}
              >
                <span>Section</span>
                <span className="text-2xl font-bold">{s}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // View 3: Student List & Progress
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedSection(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Class {selectedClass} <span className="text-slate-400">•</span> Section {selectedSection}
            </h2>
            <p className="text-slate-500 mt-1">Manage size collection for this section.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => { setSelectedClass(null); setSelectedSection(null); }}>
          Change Class
        </Button>
      </div>

      {/* Progress Summary Card */}
      <Card className="bg-slate-50/50">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500">Class & Section</p>
              <p className="text-2xl font-bold text-slate-900">{selectedClass}-{selectedSection}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 flex items-center gap-1"><Users className="w-4 h-4" /> Total</p>
              <p className="text-2xl font-bold text-slate-900">{total}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Completed</p>
              <p className="text-2xl font-bold text-emerald-600">{completed}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-600 flex items-center gap-1"><Clock className="w-4 h-4" /> Pending</p>
              <p className="text-2xl font-bold text-amber-600">{pending}</p>
            </div>
            <div className="col-span-2 md:col-span-1 space-y-2 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Progress</p>
                <p className="text-sm font-bold text-indigo-600">{progressPercent}%</p>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Students</TabsTrigger>
          <TabsTrigger value="pending">Pending Collection</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="space-y-4">
          <SizeCollectionTable students={filteredStudents} configurations={configurations} />
        </TabsContent>
        <TabsContent value="pending" className="space-y-4">
          <PendingSizesTable students={filteredStudents} configurations={configurations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

