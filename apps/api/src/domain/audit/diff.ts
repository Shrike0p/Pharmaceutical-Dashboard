import type { ChangeSet } from "@ecl/shared";

/**
 * The fields of a cleaning record that are tracked in the audit trail.
 *
 * This is an explicit allow-list rather than "every key on the object" for two
 * reasons: it keeps bookkeeping columns (`id`, `createdAt`, `updatedAt`) out of
 * the trail, and it means a caller cannot smuggle an arbitrary key into an
 * audit entry by adding it to the request body.
 */
export const AUDITED_CLEANING_RECORD_FIELDS = [
  "cleanedById",
  "cleanedAt",
  "method",
  "notes",
  "status",
  "verifiedById",
  "verifiedAt",
] as const;

export type AuditedCleaningRecordField = (typeof AUDITED_CLEANING_RECORD_FIELDS)[number];

/**
 * Reduce a stored value to something comparable and JSON-serialisable.
 *
 * - `undefined` and `null` both collapse to `null`. In the audit trail "absent"
 *   and "explicitly empty" describe the same state of the world, and JSONB
 *   cannot hold `undefined` anyway.
 * - `Date` becomes an ISO string. Comparing Dates with `===` compares object
 *   identity, so two Dates for the same instant would otherwise read as a
 *   change on every single update.
 *
 * Every audited field is a scalar (string, enum, or timestamp) by design, so
 * value comparison after normalisation is sufficient — there is no need for a
 * deep-equality walk.
 */
function normalise(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // Defensive: an audited field should never be an object. Serialise rather
  // than throw, so a schema change degrades to a noisy audit entry, not a 500.
  return JSON.stringify(value);
}

/**
 * Compute the field-level difference between a record's current state and a
 * proposed change.
 *
 * A pure function: no database, no HTTP, no clock. That is what makes the audit
 * behaviour exhaustively testable, and it is the reason this logic lives in
 * `domain/` rather than inside the service that calls it.
 *
 * @param before The record as it exists now, or `null` for a creation.
 * @param after  The proposed values. Keys absent here are left untouched.
 * @param fields The audited allow-list.
 *
 * @returns Only the fields that actually changed. Unchanged fields are absent
 *          from the result — never present with equal `old` and `new`. An empty
 *          object therefore means "nothing happened", and the caller should
 *          write no audit entry at all.
 */
export function diffFields<T extends object>(
  before: Partial<T> | null,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): ChangeSet {
  const changes: ChangeSet = {};

  for (const field of fields) {
    const proposed = after[field];

    // `undefined` means the caller did not supply this field. On a PATCH that
    // is emphatically not the same as "set it to null": `{ notes: null }` clears
    // the notes, whereas `{}` must leave them alone. Skipping here is what keeps
    // an empty PATCH body from being recorded as wiping the whole record.
    if (proposed === undefined) continue;

    const oldValue = normalise(before ? before[field] : null);
    const newValue = normalise(proposed);

    if (Object.is(oldValue, newValue)) continue;

    changes[field] = { old: oldValue, new: newValue };
  }

  return changes;
}

/** True when a change set carries no actual change. */
export function isEmptyChangeSet(changes: ChangeSet): boolean {
  return Object.keys(changes).length === 0;
}
