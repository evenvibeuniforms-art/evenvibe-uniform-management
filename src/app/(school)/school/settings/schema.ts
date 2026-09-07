import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, { message: "Full name must be at least 2 characters." }),
  phone: z.string().trim().optional().or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const passwordSchema = z.object({
  newPassword: z.string().min(8, { message: "New password must be at least 8 characters." }),
  confirmPassword: z.string().min(8, { message: "Confirm password must be at least 8 characters." }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords do not match.",
  path: ["confirmPassword"],
});

export type PasswordFormValues = z.infer<typeof passwordSchema>;
