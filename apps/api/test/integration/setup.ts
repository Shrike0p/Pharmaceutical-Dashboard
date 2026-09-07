import { afterAll, beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma.ts";
import { resetDatabase } from "../helpers/db.ts";

// Each test starts from an empty database, so no test can depend on another's
// leftovers or on the order they happen to run in.
beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
