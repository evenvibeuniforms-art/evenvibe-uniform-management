import { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_ACADEMIC_YEAR = "2026-27";

export const SUPPORTED_ACADEMIC_YEARS = [
  "2023-24",
  "2024-25",
  "2025-26",
  "2026-27",
  "2027-28",
  "2028-29",
  "2029-30",
] as const;

/**
 * Validates whether a string matches standard academic year format (e.g. "2026-27").
 */
export function isValidAcademicYear(year: string): boolean {
  if (!year || typeof year !== "string") return false;
  const trimmed = year.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  return (start + 1) % 100 === end;
}

/**
 * Formats an academic year string for UI display with an en-dash (e.g. "2026–27").
 */
export function formatAcademicYear(year: string): string {
  if (!year) return "";
  return year.replace("-", "–");
}

/**
 * Calculates the preceding academic year (e.g. "2026-27" -> "2025-26").
 */
export function getPreviousAcademicYear(year: string): string {
  const trimmed = (year || DEFAULT_ACADEMIC_YEAR).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return "2025-26";
  }
  const start = parseInt(match[1], 10) - 1;
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}

/**
 * Calculates the next academic year (e.g. "2026-27" -> "2027-28").
 */
export function getNextAcademicYear(year: string): string {
  const trimmed = (year || DEFAULT_ACADEMIC_YEAR).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return "2027-28";
  }
  const start = parseInt(match[1], 10) + 1;
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}

/**
 * Compares two academic year strings chronologically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareAcademicYears(a: string, b: string): number {
  const startA = parseInt((a || "").slice(0, 4), 10) || 0;
  const startB = parseInt((b || "").slice(0, 4), 10) || 0;
  return startA - startB;
}

/**
 * Authoritatively resolves the active academic year server-side.
 * First inspects system_settings -> 'academic_year_config'.
 * Falls back to DEFAULT_ACADEMIC_YEAR ("2026-27") if missing or on error.
 */
export async function getActiveAcademicYear(supabase?: SupabaseClient): Promise<string> {
  if (!supabase) {
    return DEFAULT_ACADEMIC_YEAR;
  }

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "academic_year_config")
      .maybeSingle();

    if (!error && data?.setting_value) {
      const config = data.setting_value as { current_academic_year?: string };
      if (config.current_academic_year && isValidAcademicYear(config.current_academic_year)) {
        return config.current_academic_year.trim();
      }
    }
  } catch (err) {
    console.warn("Failed to fetch academic_year_config from system_settings, using default:", err);
  }

  return DEFAULT_ACADEMIC_YEAR;
}
