import { z } from "zod";
import { equipmentStatusSchema, type EquipmentStatus } from "./enums";
import { paginationQuerySchema } from "./pagination";

/**
 * Equipment names are not unique on a plant floor ("Mixing Tank" x6), so the
 * asset code is the business key. Constrained to an uppercase asset-tag shape
 * to keep `MT-002`, `mt-002` and `MT 002` from becoming three assets.
 */
export const equipmentCodeSchema = z
  .string()
  .trim()
  .min(2, "Code must be at least 2 characters")
  .max(32, "Code must be at most 32 characters")
  .regex(
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    "Code must be uppercase letters and digits, separated by single hyphens (e.g. MT-002)",
  );

export const equipmentNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(120, "Name must be at most 120 characters");

export const createEquipmentSchema = z.object({
  name: equipmentNameSchema,
  code: equipmentCodeSchema,
  status: equipmentStatusSchema.default("ACTIVE"),
});

export const updateEquipmentSchema = z
  .object({
    name: equipmentNameSchema,
    code: equipmentCodeSchema,
    status: equipmentStatusSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const equipmentListQuerySchema = paginationQuerySchema.extend({
  status: equipmentStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

/**
 * The schema's *input* type. It differs from the output because `status` has a
 * default, so it is optional going in and guaranteed coming out. Form libraries
 * need both: the values the user edits, and the values the resolver produces.
 */
export type CreateEquipmentFormValues = z.input<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type EquipmentListQuery = z.infer<typeof equipmentListQuerySchema>;

export interface EquipmentDto {
  id: string;
  name: string;
  code: string;
  status: EquipmentStatus;
  cleaningRecordCount: number;
  lastCleanedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
