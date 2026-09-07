import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "../config/env.ts";

/**
 * Prisma 7 connects through a driver adapter rather than a schema-level `url`,
 * so the connection string is supplied here at construction time.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isTest ? [] : [{ emit: "event", level: "warn" }, { emit: "event", level: "error" }],
});

export type PrismaClientInstance = typeof prisma;

/**
 * The type of the client handed to a `$transaction` callback: the same surface
 * minus the methods you must not call inside a transaction. Services accept
 * this so they can be composed into a caller's transaction.
 */
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
