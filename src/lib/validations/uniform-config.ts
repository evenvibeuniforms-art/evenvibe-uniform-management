import * as z from "zod";
import { STANDARD_CLASSES } from "../constants/classes";

export const UniformItemSchema = z.object({
  id: z.string().optional(),
  item_name: z.string().trim().min(1, "Item name cannot be empty").max(100, "Item name is too long"),
  rawSizes: z.string().optional(), // Used by client form
  available_sizes: z.array(z.string()).min(1, "Please provide at least one available size"),
  is_required: z.boolean({
    message: "is_required must be a boolean"
  }),
  sort_order: z.number().int().min(0),
});

export const UniformConfigSchema = z.object({
  gender: z.enum(["Male", "Female"], {
    message: "Gender must be 'Male' or 'Female'"
  }),
  targetClasses: z.array(z.string())
    .min(1, "Please select at least one target class")
    .max(15, "Maximum of 15 classes can be selected")
    .refine((classes) => {
      const uniqueClasses = new Set(classes);
      return uniqueClasses.size === classes.length;
    }, { message: "Duplicate classes are not allowed" })
    .refine((classes) => {
      return classes.every(c => STANDARD_CLASSES.includes(c));
    }, { message: "Invalid target class selected" }),
  items: z.array(UniformItemSchema)
    .min(1, "Please add at least one uniform item")
});

export type UniformConfigInput = z.infer<typeof UniformConfigSchema>;
export type UniformItemInput = z.infer<typeof UniformItemSchema>;

export function normalizeSizes(rawSizes: string): string[] {
  return Array.from(new Set(
    rawSizes
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0)
  ));
}

export function validateDuplicateItemNames(items: { item_name: string }[]): string | null {
  const seenNames = new Set<string>();
  for (const item of items) {
    const trimmedName = item.item_name.trim();
    if (!trimmedName) continue; // let Zod handle empty
    const lowerName = trimmedName.toLowerCase();
    if (seenNames.has(lowerName)) {
      return `Duplicate item name: ${trimmedName}.`;
    }
    seenNames.add(lowerName);
  }
  return null;
}
