import { z } from "zod";
import { STANDARD_CLASSES } from "@/lib/constants/classes";

// Mapping of short numeric class formats (1 to 12) to canonical class names
export const SHORT_CLASS_MAPPING: Record<string, string> = {
  "1": "Class 1",
  "2": "Class 2",
  "3": "Class 3",
  "4": "Class 4",
  "5": "Class 5",
  "6": "Class 6",
  "7": "Class 7",
  "8": "Class 8",
  "9": "Class 9",
  "10": "Class 10",
  "11": "Class 11",
  "12": "Class 12",
};

export const USER_FRIENDLY_CLASS_ERROR =
  "Please enter a valid class such as Pre-KG, LKG, UKG, 1, 2, 3...12 or Class 1, Class 2...Class 12.";

export function getFriendlyClassErrorMessage(invalidValue?: unknown): string {
  if (invalidValue && String(invalidValue).trim()) {
    return `Invalid class '${String(invalidValue).trim()}'. Please enter a valid class such as Pre-KG, LKG, UKG, 1, 2, 3...12 or Class 1, Class 2...Class 12.`;
  }
  return USER_FRIENDLY_CLASS_ERROR;
}

/**
 * Normalizes an imported class value from Excel:
 * - Trims leading/trailing whitespace
 * - Accepts exact short values "1" through "12" -> "Class 1" through "Class 12"
 * - Accepts canonical values "Class 1" through "Class 12" -> "Class 1" through "Class 12"
 * - Accepts "Pre-KG", "LKG", "UKG" (with safe case normalization) -> "Pre-KG", "LKG", "UKG"
 * - Rejects arbitrary text such as "4th", "4th Standard", "Std 4", "Grade 4", "Class-4", etc.
 */
export function normalizeImportedClass(rawClass: unknown): string | null {
  if (rawClass === null || rawClass === undefined) return null;
  const trimmed = String(rawClass).trim();
  if (!trimmed) return null;

  // 1. Direct short numeric format: "1" to "12"
  if (Object.prototype.hasOwnProperty.call(SHORT_CLASS_MAPPING, trimmed)) {
    return SHORT_CLASS_MAPPING[trimmed];
  }

  // 2. Exact match against canonical STANDARD_CLASSES
  if (STANDARD_CLASSES.includes(trimmed)) {
    return trimmed;
  }

  // 3. Safe case handling for kindergarten classes
  const lower = trimmed.toLowerCase();
  if (lower === "pre-kg" || lower === "prekg") return "Pre-KG";
  if (lower === "lkg") return "LKG";
  if (lower === "ukg") return "UKG";

  // 4. Safe case handling for "class 1".."class 12" (exact "class" prefix followed by single space and 1..12)
  const classMatch = lower.match(/^class\s+([1-9]|1[0-2])$/);
  if (classMatch) {
    return `Class ${classMatch[1]}`;
  }

  // Any other format is rejected
  return null;
}

export const excelStudentRowSchema = z.object({
  student_name: z.string().trim().min(2, "Student name must be at least 2 characters"),
  admission_number: z.string().trim().min(1, "Admission number is required"),
  class_name: z.string().trim().transform((val, ctx) => {
    const normalized = normalizeImportedClass(val);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: getFriendlyClassErrorMessage(val),
      });
      return val;
    }
    return normalized;
  }),
  section: z.string().trim().min(1, "Section is required"),
  gender: z.string().trim().optional().or(z.literal("")).nullable().transform(v => v === "" ? null : v),
});

export type ExcelStudentRowValues = z.infer<typeof excelStudentRowSchema>;

export type ParsedStudentRow = {
  rowNumber: number;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string;
  gender: string | null;
  status: "valid" | "duplicate" | "error";
  errors: string[];
};
