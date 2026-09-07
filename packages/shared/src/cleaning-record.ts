import { z } from "zod";
import {
  cleaningMethodSchema,
  recordStatusSchema,
  type CleaningMethod,
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

export type CreateCleaningRecordInput = z.infer<typeof createCleaningRecordSchema>;
export type UpdateCleaningRecordInput = z.infer<typeof updateCleaningRecordSchema>;
export type CleaningRecordListQuery = z.infer<typeof cleaningRecordListQuerySchema>;

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
