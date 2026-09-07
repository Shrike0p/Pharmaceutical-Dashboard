import { z } from "zod";

/**
 * These mirror the Prisma enums one-for-one. They live here rather than being
 * imported from the generated Prisma client so the web client can use them
 * without taking a dependency on Prisma.
 */

export const ROLES = ["OPERATOR", "SUPERVISOR", "AUDITOR"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const EQUIPMENT_STATUSES = ["ACTIVE", "RETIRED"] as const;
export const equipmentStatusSchema = z.enum(EQUIPMENT_STATUSES);
export type EquipmentStatus = z.infer<typeof equipmentStatusSchema>;

export const RECORD_STATUSES = ["PENDING", "VERIFIED"] as const;
export const recordStatusSchema = z.enum(RECORD_STATUSES);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

/**
 * CIP = clean-in-place, COP = clean-out-of-place, SIP = steam-in-place.
 * A closed set rather than free text, because the cleaning method determines
 * which validation protocol applies.
 */
export const CLEANING_METHODS = ["CIP", "COP", "SIP", "MANUAL"] as const;
export const cleaningMethodSchema = z.enum(CLEANING_METHODS);
export type CleaningMethod = z.infer<typeof cleaningMethodSchema>;

export const AUDIT_ACTIONS = ["CREATE", "UPDATE"] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const CLEANING_METHOD_LABELS: Record<CleaningMethod, string> = {
  CIP: "Clean-in-place (CIP)",
  COP: "Clean-out-of-place (COP)",
  SIP: "Steam-in-place (SIP)",
  MANUAL: "Manual",
};

export const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: "Operator",
  SUPERVISOR: "Supervisor",
  AUDITOR: "Auditor",
};
