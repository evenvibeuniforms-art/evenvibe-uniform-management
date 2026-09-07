import { z } from "zod";

// Zod schema for validation
export const studentSchema = z.object({
  student_name: z.string().trim().min(2, "Student name must be at least 2 characters"),
  class_name: z.string().trim().min(1, "Class is required"),
  section: z.string().trim().min(1, "Section is required"),
  roll_number: z.string().trim().min(1, "Roll number is required"),
  gender: z.string().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  is_active: z.boolean(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
