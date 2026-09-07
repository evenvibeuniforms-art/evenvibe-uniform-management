import { z } from "zod";

export function normalizeDate(rawDate: unknown): string | null {
  if (!rawDate) return null;
  
  if (typeof rawDate === 'number') {
    // Excel date serial to JS Date (offset 25569 days for 1970-01-01)
    const date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  if (typeof rawDate === 'string') {
    const str = rawDate.trim();
    if (!str) return null;

    // Handle DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const match = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2}|\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);

      if (year < 100) {
        year += (year < 50 ? 2000 : 1900);
      }

      if (month < 1 || month > 12) return null;
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > daysInMonth) return null;

      const yyyy = year.toString();
      const mm = month.toString().padStart(2, '0');
      const dd = day.toString().padStart(2, '0');
      
      return `${yyyy}-${mm}-${dd}`;
    }
    
    // Fallback JS Date parsing for ISO dates like YYYY-MM-DD
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  return null;
}

export const excelStudentRowSchema = z.object({
  student_name: z.string().trim().min(2, "Student name must be at least 2 characters"),
  class_name: z.string().trim().min(1, "Class is required"),
  section: z.string().trim().min(1, "Section is required"),
  roll_number: z.string().trim().min(1, "Roll number is required"),
  gender: z.string().trim().optional().or(z.literal("")).nullable().transform(v => v === "" ? null : v),
  date_of_birth: z.any().transform((v, ctx) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const normalized = normalizeDate(v);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid Date of Birth",
      });
      return z.NEVER;
    }
    return normalized;
  }),
});

export type ExcelStudentRowValues = z.infer<typeof excelStudentRowSchema>;

export type ParsedStudentRow = {
  rowNumber: number;
  student_name: string;
  class_name: string;
  section: string;
  roll_number: string;
  gender: string | null;
  date_of_birth: string | null;
  status: "valid" | "duplicate" | "error";
  errors: string[];
};
