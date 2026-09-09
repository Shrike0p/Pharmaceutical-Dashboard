import bcrypt from "bcryptjs";
import type { ChangePasswordInput, LoginInput, LoginResponse, UserSummaryDto } from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../../errors/app-error.ts";
import { signAccessToken } from "../../middleware/authenticate.ts";

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  // Compare against a dummy hash when the user does not exist so that a missing
  // account and a wrong password take the same time to reject, and report the
  // same message — neither should tell an attacker which emails are registered.
  const hash = user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const passwordMatches = await bcrypt.compare(input.password, hash);

  if (!user || !passwordMatches) {
    throw new UnauthorizedError("Incorrect email or password");
  }

  // Unlike the unknown-account / wrong-password case above, this does not
  // need to hide behind a generic message: this is a provisioned internal
  // tool with no self-registration, so confirming an email is registered
  // carries little of the enumeration risk a public sign-up form would, and
  // a locked-out person needs to know to go find their supervisor rather than
  // keep retrying a password they know is correct.
  if (user.deactivatedAt) {
    throw new ForbiddenError("This account has been deactivated. Contact a supervisor.");
  }

  const summary: UserSummaryDto = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return { token: signAccessToken(summary), user: summary };
}

/**
 * Deactivation does not revoke a token already issued (see the trade-off note
 * on `authenticate`), but it does mean a changed password takes effect on the
 * next login rather than instantly — the same stateless-JWT trade-off. An
 * existing session can keep using its current token until it expires.
 */
export async function changeOwnPassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const currentMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    // The caller is already authenticated as this exact account, so there is
    // no enumeration concern in naming which field was wrong.
    throw new ValidationError("Request body is invalid", [
      { path: "currentPassword", message: "Current password is incorrect" },
    ]);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** The people who can be named as having performed a cleaning. */
export async function listUsers(): Promise<UserSummaryDto[]> {
  return prisma.user.findMany({
    select: userSummarySelect,
    orderBy: { name: "asc" },
  });
}
