import type { AuditAction } from "./enums";
import type { UserSummaryDto } from "./auth";

/**
 * Audited values are normalised to JSON scalars before being stored — dates
 * become ISO strings, `undefined` becomes null. Typing them this precisely
 * (rather than as `unknown`) is what lets a change set be handed straight to a
 * JSONB column without an unchecked cast.
 */
export type AuditValue = string | number | boolean | null;

/**
 * One field's transition. `old` is null on a CREATE and whenever a field was
 * previously unset; `new` is null when a field was cleared.
 *
 * Declared as a type alias rather than an interface deliberately: only aliases
 * get an implicit index signature, which is what makes `ChangeSet` structurally
 * assignable to Prisma's JSON input type.
 */
export type FieldChange = {
  old: AuditValue;
  new: AuditValue;
};

/** Map of field name -> transition. Unchanged fields are absent, never null. */
export type ChangeSet = Record<string, FieldChange>;

export interface AuditEntryDto {
  id: string;
  cleaningRecordId: string;
  action: AuditAction;
  changedBy: UserSummaryDto;
  changedAt: string;
  changes: ChangeSet;
  reason: string | null;
}

/** Human labels for the fields that appear in a change set. */
export const AUDITED_FIELD_LABELS: Record<string, string> = {
  cleanedById: "Cleaned by",
  cleanedAt: "Cleaned at",
  method: "Method",
  notes: "Notes",
  status: "Status",
  verifiedById: "Verified by",
  verifiedAt: "Verified at",
};
