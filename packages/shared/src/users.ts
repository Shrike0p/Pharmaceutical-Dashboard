import { z } from "zod";
import { roleSchema } from "./enums";
import type { UserSummaryDto } from "./auth";
import { paginationQuerySchema } from "./pagination";

/**
 * A stronger bar than the login password check (which only requires
 * non-empty, since that is a comparison against an existing hash, not a
 * strength gate). This is the bar for a password someone will actually rely
 * on going forward: at account creation and on a self-service change.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password must be at most 200 characters");

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.email("Enter a valid email address"),
  role: roleSchema,
  password: newPasswordSchema,
});

/**
 * `isActive` rather than a client-settable `deactivatedAt` timestamp: the
 * server decides when deactivation happened, the client only says whether the
 * account should be active. Deactivating rather than deleting mirrors the
 * equipment-retirement rule - this id is referenced by audit rows and
 * cleaning records that must not lose their subject.
 */
export const updateUserSchema = z
  .object({
    role: roleSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const userListQuerySchema = paginationQuerySchema.extend({
  role: roleSchema.optional(),
  isActive: z.stringbool().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/**
 * The admin table's row shape - `UserSummaryDto` plus the fields only a
 * supervisor managing accounts needs to see. Kept separate from
 * `UserSummaryDto` (used everywhere a user is just named, e.g. "cleaned by")
 * so that lighter-weight lookup never carries account-management data.
 */
export interface UserAdminDto extends UserSummaryDto {
  isActive: boolean;
  createdAt: string;
}
