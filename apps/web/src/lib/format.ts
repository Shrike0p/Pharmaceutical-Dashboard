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
