import type { AuditAction } from "./enums";
import type { UserSummaryDto } from "./auth";

/**
 * One field's transition. `old` is null on a CREATE and whenever a field was
 * previously unset; `new` is null when a field was cleared. Both are `unknown`
 * because the audit log is field-agnostic by design — see NOTES.md on why the
 * change set is stored as JSONB rather than as typed columns.
 */
export interface FieldChange {
  old: unknown;
  new: unknown;
}

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
