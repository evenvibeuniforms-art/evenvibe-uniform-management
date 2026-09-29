import { z } from "zod";

function isValidCalendarDate(val: string): boolean {
  const parts = val.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const createTcStudentSchema = z.object({
  student_id: z.string().uuid("Please select a valid student."),
  tc_date: z
    .string()
    .trim()
    .min(1, "TC Date is required.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "TC Date must be a valid date in YYYY-MM-DD format.")
    .refine(isValidCalendarDate, "TC Date must be a valid calendar date."),
});

export type CreateTcStudentInput = z.infer<typeof createTcStudentSchema>;

export const updateTcStudentSchema = z.object({
  tc_date: z
    .string()
    .trim()
    .min(1, "TC Date is required.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "TC Date must be a valid date in YYYY-MM-DD format.")
    .refine(isValidCalendarDate, "TC Date must be a valid calendar date."),
});

export type UpdateTcStudentInput = z.infer<typeof updateTcStudentSchema>;

export interface TcStudentItem {
  id: string;
  school_id: string;
  student_id: string;
  tc_date: string | null;
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
