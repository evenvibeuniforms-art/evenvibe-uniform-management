import * as z from "zod";

export const UNIFORM_TYPES = ["regular", "tshirt"] as const;
export const ITEM_TYPES = ["shirt", "tshirt", "pant", "short"] as const;
export const ISSUE_TYPES = [
  "wrong_size",
  "stitching_issue",
  "measurement_issue",
  "damaged_item",
  "missing_item",
  "wrong_item",
  "other",
] as const;

export const alterationFormSchema = z.object({
  studentId: z.string().uuid("Please select a student"),
  orderId: z.string().uuid().optional().or(z.literal("")),
  uniformType: z.enum(UNIFORM_TYPES, { message: "Please select a uniform type" }),
  itemType: z.enum(ITEM_TYPES, { message: "Please select an item" }),
  issueType: z.enum(ISSUE_TYPES, { message: "Please select an issue type" }),
  description: z.string()
    .trim()
    .min(5, "Description must be at least 5 characters")
    .max(1000, "Description is too long"),
}).superRefine((data, ctx) => {
  if (data.uniformType === "regular" && data.itemType === "tshirt") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "T-Shirt is not a valid item for Regular Uniform",
      path: ["itemType"],
    });
  }
  
  if (data.uniformType === "tshirt" && data.itemType === "shirt") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Shirt is not a valid item for T-Shirt Uniform",
      path: ["itemType"],
    });
  }
});

export type AlterationFormValues = z.infer<typeof alterationFormSchema>;
