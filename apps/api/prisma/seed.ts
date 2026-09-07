import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.ts";
import { AUDITED_CLEANING_RECORD_FIELDS, diffFields } from "../src/domain/audit/diff.ts";
// The shared enums are string unions identical to the generated Prisma ones,
// so the seed depends on the hand-written contract rather than generated code.
import type { CleaningMethod, Role } from "@ecl/shared";

/**
 * Seeds a realistic starting state:
 *   - four users covering all three roles
 *   - six pieces of equipment, one of them retired
 *   - ~70 cleaning records, unevenly distributed so pagination has several
 *     pages on the busiest asset
 *   - audit entries produced by the same diff engine the API uses, so the
 *     timeline is populated the moment a reviewer opens the app
 *
 * Deterministic: a fixed-seed PRNG means two runs produce the same data, which
 * keeps manual comparisons and screenshots stable.
 */

const SEED_PASSWORD = "Password123!";

/** Mulberry32 — small, fast, and fully deterministic from a fixed seed. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rng = createRng(20260908);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;

const NOW = Date.now();
const DAY_MS = 86_400_000;

const CLEANING_NOTES = [
  "Standard cleaning cycle completed. No residue observed.",
  "Rinse water conductivity within limits.",
  "Additional rinse performed after visual inspection.",
  "Gasket replaced during cleaning.",
  "Swab samples taken for analytical testing.",
  "Cleaned following product changeover.",
  null,
] as const;

const VERIFICATION_AMENDMENTS = [
  "Corrected cleaning end time from operator log sheet.",
  "Added swab sample reference number.",
  "Clarified the rinse volume recorded on the batch sheet.",
] as const;

async function truncateAll(): Promise<void> {
  // TRUNCATE rather than DELETE: the audit_logs table carries a trigger that
  // rejects row-level DELETE. TRUNCATE does not fire row-level triggers, and it
  // requires table ownership, so it stays an explicit administrative act.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE audit_logs, cleaning_records, equipment, users RESTART IDENTITY CASCADE`,
  );
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const definitions: Array<{ email: string; name: string; role: Role }> = [
    { email: "rahul.verma@example.com", name: "Rahul Verma", role: "OPERATOR" },
    { email: "amit.shah@example.com", name: "Amit Shah", role: "OPERATOR" },
    { email: "priya.nair@example.com", name: "Priya Nair", role: "SUPERVISOR" },
    { email: "anita.rao@example.com", name: "Anita Rao", role: "AUDITOR" },
  ];

  const users = [];
  for (const definition of definitions) {
    users.push(await prisma.user.create({ data: { ...definition, passwordHash } }));
  }
  return users;
}

async function seedEquipment() {
  const definitions = [
    { name: "Mixing Tank 02", code: "MT-002", status: "ACTIVE" as const, records: 28 },
    { name: "Mixing Tank 01", code: "MT-001", status: "ACTIVE" as const, records: 14 },
    { name: "Filling Machine 01", code: "FM-001", status: "ACTIVE" as const, records: 11 },
    { name: "Reactor 03", code: "RX-003", status: "ACTIVE" as const, records: 9 },
    { name: "Centrifuge 10", code: "CT-010", status: "ACTIVE" as const, records: 6 },
    { name: "Fluid Bed Dryer 02", code: "DR-002", status: "RETIRED" as const, records: 3 },
  ];

  const created = [];
  for (const { records, ...data } of definitions) {
    created.push({ equipment: await prisma.equipment.create({ data }), records });
  }
  return created;
}

/**
 * Mirrors the service layer: the record and its audit entry are written in one
 * transaction, and the change set comes from the shared diff engine rather than
 * being hand-written here.
 */
async function createRecordWithAudit(input: {
  equipmentId: string;
  cleanedById: string;
  cleanedAt: Date;
  method: CleaningMethod;
  notes: string | null;
  actorId: string;
}) {
  const { actorId, ...data } = input;

  return prisma.$transaction(async (tx) => {
    const record = await tx.cleaningRecord.create({ data });
    const changes = diffFields(null, record, AUDITED_CLEANING_RECORD_FIELDS);
    await tx.auditLog.create({
      data: {
        cleaningRecordId: record.id,
        action: "CREATE",
        changedById: actorId,
        changedAt: record.cleanedAt,
        changes,
      },
    });
    return record;
  });
}

async function updateRecordWithAudit(input: {
  recordId: string;
  patch: { notes?: string | null; status?: "VERIFIED"; verifiedById?: string; verifiedAt?: Date };
  actorId: string;
  changedAt: Date;
  reason?: string;
}) {
  const { recordId, patch, actorId, changedAt, reason } = input;

  return prisma.$transaction(async (tx) => {
    const before = await tx.cleaningRecord.findUniqueOrThrow({ where: { id: recordId } });
    const changes = diffFields(before, patch, AUDITED_CLEANING_RECORD_FIELDS);
    if (Object.keys(changes).length === 0) return before;

    const after = await tx.cleaningRecord.update({ where: { id: recordId }, data: patch });
    await tx.auditLog.create({
      data: {
        cleaningRecordId: recordId,
        action: "UPDATE",
        changedById: actorId,
        changedAt,
        changes,
        reason: reason ?? null,
      },
    });
    return after;
  });
}

async function main() {
  console.log("Clearing existing data…");
  await truncateAll();

  console.log("Creating users…");
  const users = await seedUsers();
  const operators = users.filter((user) => user.role === "OPERATOR");
  const supervisor = users.find((user) => user.role === "SUPERVISOR");
  if (!supervisor || operators.length === 0) throw new Error("Seed user set is incomplete");

  console.log("Creating equipment…");
  const equipmentList = await seedEquipment();

  console.log("Creating cleaning records and audit history…");
  const methods: readonly CleaningMethod[] = ["CIP", "COP", "SIP", "MANUAL"];
  let recordCount = 0;
  let auditCount = 0;

  for (const { equipment, records } of equipmentList) {
    for (let index = 0; index < records; index += 1) {
      // Spread cleanings backwards from ~12 hours ago, roughly one per 1–2 days.
      const daysAgo = index * (1 + rng()) + 0.5;
      const cleanedAt = new Date(NOW - daysAgo * DAY_MS);
      const operator = pick(operators);

      const record = await createRecordWithAudit({
        equipmentId: equipment.id,
        cleanedById: operator.id,
        cleanedAt,
        method: pick(methods),
        notes: pick(CLEANING_NOTES),
        actorId: operator.id,
      });
      recordCount += 1;
      auditCount += 1;

      // A minority of records get an operator correction before review, so some
      // timelines show more than a bare create/verify pair.
      if (rng() < 0.25) {
        await updateRecordWithAudit({
          recordId: record.id,
          patch: { notes: pick(VERIFICATION_AMENDMENTS) },
          actorId: operator.id,
          changedAt: new Date(cleanedAt.getTime() + 30 * 60_000),
        });
        auditCount += 1;
      }

      // Older records are more likely to have been reviewed already; the most
      // recent ones stay PENDING so there is something to verify in the UI.
      const isRecent = daysAgo < 4;
      if (!isRecent && rng() < 0.8) {
        const verifiedAt = new Date(cleanedAt.getTime() + (2 + rng() * 20) * 3_600_000);
        await updateRecordWithAudit({
          recordId: record.id,
          patch: { status: "VERIFIED", verifiedById: supervisor.id, verifiedAt },
          actorId: supervisor.id,
          changedAt: verifiedAt,
        });
        auditCount += 1;
      }
    }
  }

  console.log(
    [
      "",
      "Seed complete:",
      `  users            ${users.length}`,
      `  equipment        ${equipmentList.length}`,
      `  cleaning records ${recordCount}`,
      `  audit entries    ${auditCount}`,
      "",
      `  Sign in with any of the emails below and the password: ${SEED_PASSWORD}`,
      ...users.map((user) => `    ${user.role.padEnd(10)} ${user.email}`),
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
