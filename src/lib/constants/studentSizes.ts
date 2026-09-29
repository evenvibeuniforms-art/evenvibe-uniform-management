export const DEFAULT_STUDENT_SIZES = [
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
] as const;

export type DefaultStudentSize = (typeof DEFAULT_STUDENT_SIZES)[number];

/**
 * Validates that a string is a positive whole number (e.g. "18", "48", "50", "100").
 * Rejects decimals ("48.5"), negatives ("-48"), letters ("48L", "XL"), symbols ("48@"), and empty values.
 */
export function isPositiveWholeNumber(val: string | number | unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val !== "string" && typeof val !== "number") return false;
  const trimmed = String(val).trim();
  return /^[1-9]\d*$/.test(trimmed);
}

/**
 * Sorts sizes numerically first, then alphabetically for any legacy non-numeric values.
 */
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const isNumA = /^\d+$/.test(a.trim());
    const isNumB = /^\d+$/.test(b.trim());
    if (isNumA && isNumB) return parseInt(a, 10) - parseInt(b, 10);
    if (isNumA && !isNumB) return -1;
    if (!isNumA && isNumB) return 1;
    return a.localeCompare(b);
  });
}
