import bcrypt from "bcryptjs";
import type { CleaningMethod, EquipmentStatus, RecordStatus, Role, UserSummaryDto } from "@ecl/shared";
import { prisma } from "../../src/lib/prisma.ts";
import { signAccessToken } from "../../src/middleware/authenticate.ts";

export const TEST_PASSWORD = "Password123!";

/**
 * bcrypt at cost 10 takes ~60ms. The hash is identical for every fixture user,
 * so it is computed once for the whole run rather than per user.
 */
let cachedHash: string | undefined;
async function passwordHash(): Promise<string> {
  cachedHash ??= await bcrypt.hash(TEST_PASSWORD, 10);
  return cachedHash;
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}-${(counter += 1)}`;

export async function createUser(
  overrides: Partial<{ name: string; email: string; role: Role }> = {},
): Promise<UserSummaryDto> {
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `User ${unique()}`,
      email: overrides.email ?? `user-${unique()}@example.com`,
      role: overrides.role ?? "OPERATOR",
      passwordHash: await passwordHash(),
    },
    select: { id: true, name: true, email: true, role: true },
  });
  return user;
}

/**
 * Mints a token directly rather than going through POST /auth/login. The login
 * flow has its own test; everywhere else this keeps the setup fast and keeps
 * failures pointing at the behaviour under test.
 */
export function authHeader(user: UserSummaryDto): { Authorization: string } {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

export async function createEquipment(
  overrides: Partial<{ name: string; code: string; status: EquipmentStatus }> = {},
) {
  return prisma.equipment.create({
    data: {
      name: overrides.name ?? `Mixing Tank ${unique()}`,
      code: overrides.code ?? `EQ-${unique().toUpperCase()}`,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

/**
 * Creates `count` cleaning records one day apart, newest first, without audit
 * entries — pagination tests care about ordering and counts, not the trail.
 */
export async function createCleaningRecords(options: {
  equipmentId: string;
  cleanedById: string;
  count: number;
  status?: RecordStatus | ((index: number) => RecordStatus);
  method?: CleaningMethod;
  /** Timestamp of the newest record; each subsequent one is a day earlier. */
  startingAt?: Date;
}) {
  const { equipmentId, cleanedById, count, method = "CIP" } = options;
  const start = options.startingAt ?? new Date("2026-06-01T10:00:00.000Z");

  const rows = Array.from({ length: count }, (_, index) => ({
    equipmentId,
    cleanedById,
    cleanedAt: new Date(start.getTime() - index * 86_400_000),
    method,
    notes: `Record ${index + 1}`,
    status:
      typeof options.status === "function"
        ? options.status(index)
        : (options.status ?? ("PENDING" as RecordStatus)),
  }));

  await prisma.cleaningRecord.createMany({ data: rows });

  return prisma.cleaningRecord.findMany({
    where: { equipmentId },
    orderBy: [{ cleanedAt: "desc" }, { id: "desc" }],
  });
}
