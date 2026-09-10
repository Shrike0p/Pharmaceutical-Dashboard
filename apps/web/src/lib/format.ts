import { AUDITED_FIELD_LABELS, CLEANING_METHOD_LABELS, type AuditValue } from "@ecl/shared";

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateOnly.format(new Date(iso));
}

/**
 * A page number out of a URL is user input. `Number("abc")` is `NaN`, which
 * serialises into the query string as the literal "NaN" and comes back as a
 * 400 from the API's Zod coercion — so clamp it to a sane page here instead.
 */
export function parsePageParam(raw: string | null): number {
  const page = Number(raw ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Formats a `YYYY-MM-DD` calendar day. `new Date("2026-09-08")` parses as UTC
 * midnight, so anywhere west of Greenwich the naive version renders the day
 * before — this reads the parts and builds a local date instead.
 */
export function formatIsoDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return dateOnly.format(new Date(year, month - 1, date));
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * "yesterday" / "3 days ago" — the secondary line beside an absolute date in a
 * table, where recency is the thing being scanned for. Rounds to whole days
 * because that is the granularity a cleaning schedule is read at.
 */
export function formatRelativeDays(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.round((then.getTime() - Date.now()) / 86_400_000);
  return relative.format(days, "day");
}

/** Value for an `<input type="datetime-local">`, which wants local wall time. */
export function toDateTimeLocalValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fieldLabel(field: string): string {
  return AUDITED_FIELD_LABELS[field] ?? field;
}

/**
 * Renders one side of an audit transition.
 *
 * The trail stores raw values, so ids and timestamps need turning back into
 * something a person can read. `resolveUser` is supplied by the caller because
 * only it knows the staff directory.
 */
export function formatAuditValue(
  field: string,
  value: AuditValue,
  resolveUser: (id: string) => string | undefined,
): string {
  if (value === null || value === "") return "—";

  if (field === "cleanedById" || field === "verifiedById") {
    return resolveUser(String(value)) ?? String(value);
  }
  if (field === "cleanedAt" || field === "verifiedAt") {
    return formatDateTime(String(value));
  }
  if (field === "method") {
    return CLEANING_METHOD_LABELS[value as keyof typeof CLEANING_METHOD_LABELS] ?? String(value);
  }
  if (field === "status") {
    const text = String(value);
    return text.charAt(0) + text.slice(1).toLowerCase();
  }
  return String(value);
}

/** Two-letter avatar fallback, e.g. "Priya Nair" -> "PN". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}
