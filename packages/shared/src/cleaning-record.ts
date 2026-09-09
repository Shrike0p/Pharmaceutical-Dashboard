import { z } from "zod";
import {
  cleaningMethodSchema,
  recordStatusSchema,
  type CleaningMethod,
  type EquipmentStatus,
  type RecordStatus,
} from "./enums";
import { paginationQuerySchema } from "./pagination";
import type { UserSummaryDto } from "./auth";

/**
 * Accepts both a full ISO-8601 string and the `YYYY-MM-DDTHH:mm` value an
 * `<input type="datetime-local">` produces, so the same schema can validate the
 * form on the client and the payload on the server.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

export const cleanedAtSchema = z
  .string()
  .min(1, "Cleaning date and time is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be a valid date and time",
  })
  .refine(
    (value) => {
      const parsed = Date.parse(value);
      // Unparseable values are already reported by the refinement above; do not
      // pile a second, confusing "in the future" error onto the same field.
      return Number.isNaN(parsed) || parsed <= Date.now() + CLOCK_SKEW_TOLERANCE_MS;
    },
    { message: "Cleaning cannot be recorded in the future" },
  );

export const cleaningNotesSchema = z
  .string()
  .trim()
  .max(2000, "Notes must be at most 2000 characters");

/**
 * `status` is deliberately absent: a cleaning record always begins PENDING and
 * only reaches VERIFIED through a supervisor's explicit review. Letting the
 * creator self-declare a record verified would defeat the two-person rule.
 */
export const createCleaningRecordSchema = z.object({
  cleanedById: z.uuid("Select who performed the cleaning"),
  cleanedAt: cleanedAtSchema,
  method: cleaningMethodSchema,
  notes: cleaningNotesSchema.nullish(),
});

export const updateCleaningRecordSchema = z
  .object({
    cleanedById: z.uuid(),
    cleanedAt: cleanedAtSchema,
    method: cleaningMethodSchema,
    notes: cleaningNotesSchema.nullable(),
    status: recordStatusSchema,
    /**
     * GxP: amending a record that has already been verified requires a stated
     * reason, which is persisted on the audit entry rather than on the record.
     * Enforced in the service, which is the only place that knows the record's
     * current status.
     */
    reason: z
      .string()
      .trim()
      .min(3, "Reason must be at least 3 characters")
      .max(500, "Reason must be at most 500 characters"),
  })
  .partial()
  .refine(
    (value) =>
      Object.keys(value).filter((key) => key !== "reason").length > 0,
    { message: "Provide at least one field to update" },
  );

export const cleaningRecordListQuerySchema = paginationQuerySchema.extend({
  status: recordStatusSchema.optional(),
});

/**
 * A calendar day boundary for range filters (`from`/`to`), not a timestamp.
 * The service layer treats `from` as the start of that day and `to` as its
 * end, both in UTC — a filter is a coarse "which days" question, not a
 * precise instant, and a date-only input pairs with a date-range picker in
 * the UI without a timezone-conversion round trip.
 */
const filterDateSchema = z.iso.date();

/**
 * Cross-equipment record listing (`GET /api/cleaning-records`), as opposed to
 * `cleaningRecordListQuerySchema` above which is scoped to one asset. Adds the
 * filters a records table needs when it is not already narrowed by URL: which
 * asset, who performed the cleaning, which method, and a date range.
 */
export const globalCleaningRecordListQuerySchema = paginationQuerySchema
  .extend({
    status: recordStatusSchema.optional(),
    equipmentId: z.uuid().optional(),
    cleanedById: z.uuid().optional(),
    method: cleaningMethodSchema.optional(),
    from: filterDateSchema.optional(),
    to: filterDateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "'from' must be on or before 'to'",
    path: ["to"],
  });

export type CreateCleaningRecordInput = z.infer<typeof createCleaningRecordSchema>;
export type UpdateCleaningRecordInput = z.infer<typeof updateCleaningRecordSchema>;
export type CleaningRecordListQuery = z.infer<typeof cleaningRecordListQuerySchema>;
export type GlobalCleaningRecordListQuery = z.infer<typeof globalCleaningRecordListQuerySchema>;

export interface CleaningRecordDto {
  id: string;
  equipmentId: string;
  cleanedBy: UserSummaryDto;
  cleanedAt: string;
  method: CleaningMethod;
  notes: string | null;
  status: RecordStatus;
  verifiedBy: UserSummaryDto | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The cross-equipment records table shows which asset each row belongs to
 * without a second fetch per row, so the global endpoint's DTO carries a
 * small equipment summary. The per-equipment endpoint doesn't need this — the
 * asset is already implied by the URL — so it keeps the plain `CleaningRecordDto`.
 */
export interface GlobalCleaningRecordDto extends CleaningRecordDto {
  equipment: {
    id: string;
    name: string;
    code: string;
    status: EquipmentStatus;
  };
}
