import { z } from "zod";
import { UNIFORM_TYPES, REGULAR_UNIFORM_SIZES, TSHIRT_UNIFORM_SIZES, PANT_SHORT_SIZES } from "@/lib/constants/uniformSizes";

export const sizeCollectionSchema = z.object({
  student_id: z.string().uuid(),
  uniform_type: z.enum([UNIFORM_TYPES.REGULAR, UNIFORM_TYPES.TSHIRT]),
  shirt_size: z.string().nullable().optional(),
  tshirt_size: z.string().nullable().optional(),
  pant_size: z.string().nullable().optional(),
  short_size: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.uniform_type === UNIFORM_TYPES.REGULAR) {
    if (!data.shirt_size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Shirt size is required", path: ["shirt_size"] });
    }
    if (data.shirt_size && !(REGULAR_UNIFORM_SIZES as readonly string[]).includes(data.shirt_size)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid shirt size", path: ["shirt_size"] });
    }
  } else if (data.uniform_type === UNIFORM_TYPES.TSHIRT) {
    if (!data.tshirt_size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "T-Shirt size is required", path: ["tshirt_size"] });
    }
    if (data.tshirt_size && !(TSHIRT_UNIFORM_SIZES as readonly string[]).includes(data.tshirt_size)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid t-shirt size", path: ["tshirt_size"] });
    }
  }

  if (!data.pant_size && !data.short_size) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select either Pant Size or Short Size.", path: ["pant_size"] });
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select either Pant Size or Short Size.", path: ["short_size"] });
  }

  if (data.pant_size && !(PANT_SHORT_SIZES as readonly string[]).includes(data.pant_size)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid pant size", path: ["pant_size"] });
  }
  if (data.short_size && !(PANT_SHORT_SIZES as readonly string[]).includes(data.short_size)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid short size", path: ["short_size"] });
  }
});

export type SizeCollectionFormValues = z.infer<typeof sizeCollectionSchema>;

export type StudentSizeRecord = {
  id: string;
  student_id: string;
  school_id: string;
  uniform_type: "regular" | "tshirt";
  shirt_size: string | null;
  tshirt_size: string | null;
  pant_size: string | null;
  short_size: string | null;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentWithSize = {
  id: string;
  student_name: string;
  class_name: string;
  section: string;
  roll_number: string;
  size_record: StudentSizeRecord | null;
};
