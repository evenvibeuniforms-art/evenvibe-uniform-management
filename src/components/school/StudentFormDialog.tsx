"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createStudent, updateStudent } from "@/app/(school)/school/students/actions";
import { StudentFormValues, studentSchema } from "@/app/(school)/school/students/schema";
import { Loader2, Plus } from "lucide-react";



export interface Student {
  id: string;
  student_name: string;
  class_name?: string;
  section?: string;
  roll_number?: string;
  gender?: string;
  date_of_birth?: string;
  is_active: boolean;
}

interface StudentFormDialogProps {
  mode: "add" | "edit";
  initialData?: Student; // The existing student record if in edit mode
  trigger?: React.ReactNode;
}

export function StudentFormDialog({ mode, initialData, trigger }: StudentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      student_name: initialData?.student_name || "",
      class_name: initialData?.class_name || "",
      section: initialData?.section || "",
      roll_number: initialData?.roll_number || "",
      gender: initialData?.gender || "",
      date_of_birth: initialData?.date_of_birth || "",
      is_active: initialData?.is_active ?? true,
    },
  });

  const onSubmit = async (data: StudentFormValues) => {
    setError(null);
    let result;
    
    if (mode === "add") {
      result = await createStudent(data);
    } else {
      if (!initialData?.id) return;
      result = await updateStudent(initialData.id, data);
    }

    if (result.success) {
      setOpen(false);
      if (mode === "add") {
        reset(); // Only reset on add
      }
    } else {
      setError(result.error || "An error occurred");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Clean up when closing
      if (mode === "add") reset();
      setError(null);
    } else {
      // Re-initialize edit form
      if (mode === "edit" && initialData) {
        reset({
          student_name: initialData.student_name || "",
          class_name: initialData.class_name || "",
          section: initialData.section || "",
          roll_number: initialData.roll_number || "",
          gender: initialData.gender || "",
          date_of_birth: initialData.date_of_birth || "",
          is_active: initialData.is_active ?? true,
        });
      }
    }
    setOpen(newOpen);
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const genderValue = watch("gender");
  const isActiveValue = watch("is_active");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white">
        {trigger || (
          <>
            <Plus className="mr-2 h-4 w-4" /> Add Student
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add New Student" : "Edit Student"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Enter the student's details below." : "Update the student's information."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-900 border-b pb-2">Academic Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student_name">Student Name *</Label>
                <Input id="student_name" {...register("student_name")} placeholder="Full name" />
                {errors.student_name && <p className="text-xs text-red-500">{errors.student_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="class_name">Class *</Label>
                <Input id="class_name" {...register("class_name")} placeholder="e.g. Grade 10" />
                {errors.class_name && <p className="text-xs text-red-500">{errors.class_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="section">Section *</Label>
                <Input id="section" {...register("section")} placeholder="e.g. A" />
                {errors.section && <p className="text-xs text-red-500">{errors.section.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="roll_number">Roll Number *</Label>
                <Input id="roll_number" {...register("roll_number")} placeholder="e.g. 1" />
                {errors.roll_number && <p className="text-xs text-red-500">{errors.roll_number.message}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-900 border-b pb-2">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={genderValue || ""} onValueChange={(val) => setValue("gender", val as string)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
              </div>
            </div>
          </div>

          {mode === "edit" && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-slate-900 border-b pb-2">Account Status</h4>
              <div className="flex items-center space-x-2">
                <Select 
                  value={isActiveValue ? "active" : "inactive"} 
                  onValueChange={(val) => setValue("is_active", val === "active")}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "add" ? "Save Student" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
