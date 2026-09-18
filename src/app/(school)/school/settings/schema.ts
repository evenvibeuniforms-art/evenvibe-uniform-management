import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().optional().refine((val) => !val || /^\+?[\d\s-]{10,}$/.test(val), {
    message: "Please enter a valid phone number.",
  }),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const passwordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type PasswordFormValues = z.infer<typeof passwordSchema>;

export const schoolInfoSchema = z.object({
  address: z.string().min(5, "Address must be at least 5 characters.").optional().or(z.literal('')),
  city: z.string().min(2, "City must be at least 2 characters.").optional().or(z.literal('')),
  district: z.string().min(2, "District must be at least 2 characters.").optional().or(z.literal('')),
  pincode: z.string().optional().refine((val) => !val || /^\d{6}$/.test(val), {
    message: "Pincode must be a 6-digit number.",
  }).or(z.literal('')),
  contact_name: z.string().min(2, "Contact name must be at least 2 characters.").optional().or(z.literal('')),
  contact_phone: z.string().optional().refine((val) => !val || /^\+?[\d\s-]{10,}$/.test(val), {
    message: "Please enter a valid phone number.",
  }).or(z.literal('')),
});

export type SchoolInfoFormValues = z.infer<typeof schoolInfoSchema>;
