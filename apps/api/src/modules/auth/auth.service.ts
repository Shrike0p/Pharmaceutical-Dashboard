import bcrypt from "bcryptjs";
import type { LoginInput, LoginResponse, UserSummaryDto } from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { UnauthorizedError } from "../../errors/app-error.ts";
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

  const summary: UserSummaryDto = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return { token: signAccessToken(summary), user: summary };
}

/** The people who can be named as having performed a cleaning. */
export async function listUsers(): Promise<UserSummaryDto[]> {
  return prisma.user.findMany({
    select: userSummarySelect,
    orderBy: { name: "asc" },
  });
}
