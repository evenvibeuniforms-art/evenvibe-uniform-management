import { z } from "zod";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

export const VALID_GENDERS = ["Male", "Female"] as const;
export type ValidGender = (typeof VALID_GENDERS)[number];

// Zod schema for student creation and editing validation
export const studentSchema = z.object({
  student_name: z
    .string({ error: "Student name is required." })
    .trim()
    .min(1, "Student name is required."),
  admission_number: z
    .string({ error: "Admission number is required." })
    .trim()
    .min(1, "Admission number is required."),
  class_name: z.enum([...STANDARD_CLASSES] as [string, ...string[]], {
    error: "Please select a valid class.",
  }),
  section: z
    .string({ error: "Section is required." })
    .trim()
    .min(1, "Section is required."),
  gender: z.enum(VALID_GENDERS, {
    error: "Please select a gender.",
  }),
  is_active: z.boolean(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
