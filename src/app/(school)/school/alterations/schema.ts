import * as z from "zod";
import { isPositiveWholeNumber } from "@/lib/constants/studentSizes";

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
    styleName: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    reason: z.enum(ALTERATION_REASONS, {
      message: "Please select a valid reason",
    }),
    givenSize: z.string().optional().nullable(),
    currentSize: z.string().optional().nullable(),
    changeSize: z.string().optional().nullable(),
    requiredSize: z.string().optional().nullable(),
    quantity: z.coerce
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .default(1),
    remarks: z.string().max(1000, "Remarks cannot exceed 1000 characters").optional().nullable(),
    proofPhotoUrl: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const finalChangeSize = (data.changeSize || data.requiredSize || "").trim();
    if (SIZE_RELATED_REASONS.includes(data.reason) || finalChangeSize !== "") {
      if (!finalChangeSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Change size is required for this alteration",
          path: ["changeSize"],
        });
      } else if (!isPositiveWholeNumber(finalChangeSize)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Change size must be a valid positive whole number (e.g. 18, 20, 32, 48)",
          path: ["changeSize"],
        });
      }
    }
  });

export type NewAlterationFormValues = z.infer<typeof newAlterationSchema>;
