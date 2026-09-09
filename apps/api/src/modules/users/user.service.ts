import bcrypt from "bcryptjs";
import type {
  CreateUserInput,
  Paginated,
  UpdateUserInput,
  UserAdminDto,
  UserListQuery,
  UserSummaryDto,
} from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { ForbiddenError, NotFoundError } from "../../errors/app-error.ts";
import { buildOffsetMeta } from "../../domain/pagination/cursor.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const adminSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  deactivatedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminRow = Prisma.UserGetPayload<{ select: typeof adminSelect }>;

function toAdminDto(row: AdminRow): UserAdminDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.deactivatedAt === null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The account-management table, distinct from `listUsers` in `auth.service.ts`
 * (the lightweight "cleaned by" picker feed) - this one carries account status
 * and is reachable only to a supervisor.
 */
export async function listUsersAdmin(query: UserListQuery): Promise<Paginated<UserAdminDto>> {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive === undefined ? {} : { deactivatedAt: query.isActive ? null : { not: null } }),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: adminSelect,
      orderBy: [{ name: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: rows.map(toAdminDto), pagination: buildOffsetMeta(query.page, query.limit, total) };
}

/**
 * Provisioning, not self-registration: this is how an account comes to
 * exist in a system where the audit trail's "who" has to mean something. A
 * duplicate email surfaces as Prisma P2002, mapped to 409 by the error
 * handler.
 */
export async function createUser(input: CreateUserInput): Promise<UserAdminDto> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const row = await prisma.user.create({
    data: { name: input.name, email: input.email.toLowerCase(), role: input.role, passwordHash },
    select: adminSelect,
  });
  return toAdminDto(row);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: UserSummaryDto,
): Promise<UserAdminDto> {
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("User", id);

  // A supervisor who locks out their own account has no way back in short of
  // direct database access, so this is refused outright rather than merely
  // discouraged.
  if (actor.id === id && input.isActive === false) {
    throw new ForbiddenError("You cannot deactivate your own account");
  }

  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { deactivatedAt: input.isActive ? null : new Date() } : {}),
    },
    select: adminSelect,
  });

  return toAdminDto(row);
}
