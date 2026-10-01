import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merge. Later classes win, so a `size` prop overrides a default. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escapes a string for safe use inside a Mongo `$regex`.
 *
 * Without this, a search for `(` becomes a quantifier and a search for `.*` matches everything.
 * It also neutralises the `$`-prefixed selector vector if a value ever reaches a raw regex.
 * See docs/security.md section 5.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `John Mwangi` from the name parts, skipping absent middle names. */
export function fullName(person: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [person.firstName, person.middleName, person.lastName]
    .filter(Boolean)
    .join(" ");
}

export function initials(person: {
  firstName: string;
  lastName: string;
}): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}

/** `John Mwangi` → `JM`. Used for avatar placeholders. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Percentage helper that never returns NaN on a zero denominator. */
export function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

/** Non-negative clamp used by pagination and coverage maths. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
