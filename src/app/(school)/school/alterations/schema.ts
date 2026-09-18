import * as z from "zod";

export const ALTERATION_REASONS = [
  "Size Correction",
  "Wrong Size Received",
  "Wrong Item Received",
  "Damaged Item",
  "Stitching Issue",
  "Measurement Issue",
  "Missing Item",
  "Other",
] as const;

export type AlterationReason = (typeof ALTERATION_REASONS)[number];

export const SIZE_RELATED_REASONS: AlterationReason[] = [
  "Size Correction",
  "Wrong Size Received",
  "Measurement Issue",
];

export const ALTERATION_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "rejected",
  "rework",
  "completed",
] as const;

export type AlterationStatus = (typeof ALTERATION_STATUSES)[number];

export const newAlterationSchema = z
  .object({
    orderId: z.string().uuid("Please select a delivered order"),
    studentId: z.string().uuid("Please select a student"),
    itemName: z.string().min(1, "Please select a uniform item"),
    reason: z.enum(ALTERATION_REASONS, {
      message: "Please select a valid reason",
    }),
    currentSize: z.string().optional().nullable(),
    requiredSize: z.string().optional().nullable(),
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1"),
    remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional().nullable(),
    proofPhotoUrl: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (SIZE_RELATED_REASONS.includes(data.reason)) {
      if (!data.requiredSize || data.requiredSize.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required size is required for size-related alterations",
          path: ["requiredSize"],
        });
      }
    }
  });

export type NewAlterationFormValues = z.infer<typeof newAlterationSchema>;
