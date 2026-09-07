import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserSummaryDto } from "@ecl/shared";
import { buildApp } from "../../src/app.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { authHeader, createEquipment, createUser } from "../helpers/fixtures.ts";

const app = buildApp();

let operator: UserSummaryDto;
let supervisor: UserSummaryDto;
let equipmentId: string;

async function createRecord(actor: UserSummaryDto = operator, cleanedById = operator.id) {
  const response = await request(app)
    .post(`/api/equipment/${equipmentId}/cleaning-records`)
    .set(authHeader(actor))
    .send({
      cleanedById,
      cleanedAt: "2026-06-01T10:00:00.000Z",
      method: "CIP",
      notes: "Standard cleaning",
    })
    .expect(201);
  return response.body.data as { id: string };
}

const auditRows = (recordId: string) =>
  prisma.auditLog.findMany({ where: { cleaningRecordId: recordId }, orderBy: { changedAt: "asc" } });

beforeEach(async () => {
  operator = await createUser({ role: "OPERATOR", name: "Rahul Verma" });
  supervisor = await createUser({ role: "SUPERVISOR", name: "Priya Nair" });
  equipmentId = (await createEquipment({ code: "MT-002" })).id;
});

describe("audit trail — creation", () => {
  it("writes exactly one CREATE entry recording every field as null -> value", async () => {
    const record = await createRecord();
    const entries = await auditRows(record.id);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "CREATE", changedById: operator.id, reason: null });
    expect(entries[0]?.changes).toEqual({
      cleanedById: { old: null, new: operator.id },
      cleanedAt: { old: null, new: "2026-06-01T10:00:00.000Z" },
      method: { old: null, new: "CIP" },
      notes: { old: null, new: "Standard cleaning" },
      status: { old: null, new: "PENDING" },
    });
  });
});

describe("audit trail — updates", () => {
  it("records only the field that changed, not the whole payload", async () => {
    const record = await createRecord();

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      // method and cleanedAt are resent unchanged; only notes differs.
      .set(authHeader(operator))
      .send({ notes: "Additional rinse performed", method: "CIP", cleanedAt: "2026-06-01T10:00:00.000Z" })
      .expect(200);

    const entries = await auditRows(record.id);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.changes).toEqual({
      notes: { old: "Standard cleaning", new: "Additional rinse performed" },
    });
  });

  it("writes no audit entry when the update changes nothing", async () => {
    const record = await createRecord();

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(operator))
      .send({ notes: "Standard cleaning" })
      .expect(200);

    // Saving a form without editing it is not an event worth recording; a trail
    // padded with no-ops is harder for an auditor to read, not safer.
    expect(await auditRows(record.id)).toHaveLength(1);
  });

  it("attributes the change to the authenticated user, ignoring the request body", async () => {
    const record = await createRecord();
    const someoneElse = await createUser({ role: "OPERATOR", name: "Impostor" });

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(supervisor))
      .send({ notes: "Edited", changedById: someoneElse.id, changedBy: someoneElse.id })
      .expect(200);

    const entries = await auditRows(record.id);
    // The actor comes from the verified token, so a client cannot pin its
    // change on somebody else.
    expect(entries[1]?.changedById).toBe(supervisor.id);
  });

  it("records the verification transition with its metadata", async () => {
    const record = await createRecord();

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(200);

    const entries = await auditRows(record.id);
    const changes = entries[1]?.changes as Record<string, { old: unknown; new: unknown }>;

    expect(changes["status"]).toEqual({ old: "PENDING", new: "VERIFIED" });
    expect(changes["verifiedById"]).toEqual({ old: null, new: supervisor.id });
    expect(changes["verifiedAt"]?.old).toBeNull();
    expect(typeof changes["verifiedAt"]?.new).toBe("string");
  });

  it("requires a reason to amend a verified record, and stores it on the entry", async () => {
    const record = await createRecord();
    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(200);

    const rejected = await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(operator))
      .send({ notes: "Late correction" })
      .expect(400);
    expect(rejected.body.error.details[0].path).toBe("reason");

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(operator))
      .send({ notes: "Late correction", reason: "Transcription error on the batch sheet" })
      .expect(200);

    const entries = await auditRows(record.id);
    expect(entries.at(-1)?.reason).toBe("Transcription error on the batch sheet");
  });
});

describe("audit trail — integrity", () => {
  it("rolls the record update back if the audit entry cannot be written", async () => {
    const record = await createRecord();

    // Force the audit insert to fail, from inside the database, so the
    // transaction is exercised for real rather than through a mock.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_audit_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated audit failure'; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION test_fail_audit_insert();
    `);

    try {
      await request(app)
        .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
        .set(authHeader(operator))
        .send({ notes: "This change must not survive" })
        .expect(500);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS test_fail_audit ON audit_logs");
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_fail_audit_insert()");
    }

    // A change with no audit entry is exactly the untraceable mutation the
    // system exists to prevent, so neither write may survive alone.
    const after = await prisma.cleaningRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.notes).toBe("Standard cleaning");
    expect(await auditRows(record.id)).toHaveLength(1);
  });

  it("refuses UPDATE and DELETE against the audit log", async () => {
    const record = await createRecord();
    const [entry] = await auditRows(record.id);

    await expect(
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET reason = 'tampered' WHERE id = $1`, entry?.id),
    ).rejects.toThrow(/append-only/i);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1`, entry?.id),
    ).rejects.toThrow(/append-only/i);

    expect(await auditRows(record.id)).toHaveLength(1);
  });
});

describe("audit trail — reading", () => {
  it("returns the history newest first with the actor resolved", async () => {
    const record = await createRecord();
    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${record.id}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(200);

    const response = await request(app)
      .get(`/api/equipment/${equipmentId}/cleaning-records/${record.id}/audit`)
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.pagination.total).toBe(2);
    expect(response.body.data[0].action).toBe("UPDATE");
    expect(response.body.data[0].changedBy.name).toBe("Priya Nair");
    expect(response.body.data[1].action).toBe("CREATE");
    expect(response.body.data[1].changedBy.name).toBe("Rahul Verma");
  });

  it("does not expose a record through the wrong equipment", async () => {
    const record = await createRecord();
    const other = await createEquipment({ code: "FM-001" });

    await request(app)
      .get(`/api/equipment/${other.id}/cleaning-records/${record.id}/audit`)
      .set(authHeader(operator))
      .expect(404);
  });
});
