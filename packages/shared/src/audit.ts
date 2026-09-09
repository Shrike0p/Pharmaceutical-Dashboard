import { z } from "zod";
import { auditActionSchema, type AuditAction } from "./enums";
import type { UserSummaryDto } from "./auth";
import { paginationQuerySchema } from "./pagination";

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

/**
 * The global compliance view (`GET /api/audit`) is what answers "what did
 * Priya change in March" - a question the per-record endpoint cannot, since
 * it always starts from a specific record. Filters mirror the columns an
 * auditor actually scopes by: who made the change, what kind of change,
 * which asset, which field, and when.
 */
export const auditListQuerySchema = paginationQuerySchema
  .extend({
    action: auditActionSchema.optional(),
    changedById: z.uuid().optional(),
    equipmentId: z.uuid().optional(),
    /** Restricts to entries whose change set touches this field, e.g. "status". */
    field: z.string().min(1).max(64).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "'from' must be on or before 'to'",
    path: ["to"],
  });

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

/**
 * The global trail shows which asset and which cleaning each entry belongs
 * to, since it is no longer scoped by a record already named in the URL.
 */
export interface GlobalAuditEntryDto extends AuditEntryDto {
  equipment: {
    id: string;
    name: string;
    code: string;
  };
  cleaningRecord: {
    cleanedAt: string;
  };
}
