import { z } from "zod";

export const createTcStudentSchema = z.object({
  student_id: z.string().uuid("Please select a valid student."),
  tc_number: z
    .string()
    .trim()
    .min(1, "TC Number is required.")
    .max(100, "TC Number must not exceed 100 characters."),
});

export type CreateTcStudentInput = z.infer<typeof createTcStudentSchema>;

export const updateTcStudentSchema = z.object({
  tc_number: z
    .string()
    .trim()
    .min(1, "TC Number is required.")
    .max(100, "TC Number must not exceed 100 characters."),
});

export type UpdateTcStudentInput = z.infer<typeof updateTcStudentSchema>;

export interface TcStudentItem {
  id: string;
  school_id: string;
  student_id: string;
  tc_number: string;
  created_at: string;
  updated_at: string;
  student: {
    id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section: string;
    gender: string;
  };
}

export interface EligibleStudent {
  id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string;
  gender: string;
}
