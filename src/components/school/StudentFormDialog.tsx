"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStudent, updateStudent } from "@/app/(school)/school/students/actions";
import {
  StudentFormValues,
  studentSchema,
  VALID_GENDERS,
} from "@/app/(school)/school/students/schema";
import { Loader2 } from "lucide-react";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

export interface Student {
  id: string;
  student_name: string;
  admission_number?: string;
  class_name?: string;
  section?: string;
  gender?: string | null;
  is_active: boolean;
}

interface StudentFormDialogProps {
  mode: "add" | "edit";
  initialData?: Student;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StudentFormDialog({
  mode,
  initialData,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: StudentFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      student_name: initialData?.student_name || "",
      admission_number: initialData?.admission_number || "",
      class_name:
        (initialData?.class_name as StudentFormValues["class_name"]) ||
        ("" as unknown as StudentFormValues["class_name"]),
      section: initialData?.section || "",
      gender:
        (initialData?.gender as StudentFormValues["gender"]) ||
        ("" as unknown as StudentFormValues["gender"]),
      is_active: initialData?.is_active ?? true,
    },
  });

  // Rehydrate form whenever dialog opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (mode === "edit" && initialData) {
        const validGender =
          initialData.gender === "Male" || initialData.gender === "Female"
            ? initialData.gender
            : ("" as unknown as StudentFormValues["gender"]);

        reset({
          student_name: initialData.student_name || "",
          admission_number: initialData.admission_number || "",
          class_name:
            (initialData.class_name as StudentFormValues["class_name"]) ||
            ("" as unknown as StudentFormValues["class_name"]),
          section: initialData.section || "",
          gender: validGender,
          is_active: initialData.is_active ?? true,
        });
      } else if (mode === "add") {
        reset({
          student_name: "",
          admission_number: "",
          class_name: "" as unknown as StudentFormValues["class_name"],
          section: "",
          gender: "" as unknown as StudentFormValues["gender"],
          is_active: true,
        });
      }
      setError(null);
    }
  }, [isOpen, mode, initialData, reset]);

  const onSubmit = async (data: StudentFormValues) => {
    setError(null);
    let result;

    if (mode === "add") {
      result = await createStudent(data);
    } else {
      if (!initialData?.id) {
        setError("Student record ID is missing.");
        return;
      }
      result = await updateStudent(initialData.id, data);
    }

    if (result.success) {
      setIsOpen(false);
      if (mode === "add") {
        reset();
      }
    } else {
      setError(result.error || "An error occurred");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      if (mode === "add") reset();
      setError(null);
    }
    setIsOpen(newOpen);
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const genderValue = watch("gender");
  const classValue = watch("class_name");
  const isActiveValue = watch("is_active");

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && (
        <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add New Student" : "Edit Student"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Enter the student's details below."
              : "Update the student's information."}
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
                {errors.student_name && (
                  <p className="text-xs text-red-500">{errors.student_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="admission_number">Admission Number *</Label>
                <Input id="admission_number" {...register("admission_number")} placeholder="e.g. ADM001" />
                {errors.admission_number && (
                  <p className="text-xs text-red-500">{errors.admission_number.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="class_name">Class *</Label>
                <Select
                  value={classValue || ""}
                  onValueChange={(val) =>
                    setValue("class_name", (val || "") as StudentFormValues["class_name"], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="class_name">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_CLASSES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                    {classValue && !STANDARD_CLASSES.includes(classValue) && (
                      <SelectItem value={classValue} disabled className="text-red-500 italic">
                        Legacy: {classValue} (Invalid)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {errors.class_name && (
                  <p className="text-xs text-red-500">{errors.class_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="section">Section *</Label>
                <Input id="section" {...register("section")} placeholder="e.g. A" />
                {errors.section && (
                  <p className="text-xs text-red-500">{errors.section.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-slate-900 border-b pb-2">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select
                  value={genderValue || ""}
                  onValueChange={(val) =>
                    setValue("gender", (val || "") as StudentFormValues["gender"], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                    {genderValue && !(VALID_GENDERS as readonly string[]).includes(genderValue) && (
                      <SelectItem value={genderValue} disabled className="text-red-500 italic">
                        Legacy: {genderValue} (Invalid)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p className="text-xs text-red-500">{errors.gender.message}</p>
                )}
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
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "add" ? "Save Student" : "Update Student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
