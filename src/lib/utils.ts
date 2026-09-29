import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats an ISO date/time string into standard Indian Standard Time (IST, Asia/Kolkata).
 * Example output: "20 Sep 2026, 09:42 AM"
 * Returns safe fallback "Date not available" if input is missing or invalid.
 */
export function formatDateTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return "Date not available";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Date not available";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .format(d)
      .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  } catch {
    return "Date not available";
  }
}

/**
 * Returns the current date in YYYY-MM-DD format based on Indian Standard Time (IST, Asia/Kolkata).
 * Avoids UTC timezone shift errors.
 */
export function getTodayDateIST(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

