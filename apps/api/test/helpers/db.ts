import { prisma } from "../../src/lib/prisma.ts";

/**
 * Empties every table between tests.
 *
 * TRUNCATE rather than DELETE, for two reasons: it is much faster than
 * cascading deletes, and audit_logs carries a trigger that rejects row-level
 * DELETE — which is exactly the behaviour one of the tests asserts.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "TRUNCATE TABLE audit_logs, cleaning_records, equipment, users RESTART IDENTITY CASCADE",
  );
}
