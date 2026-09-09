import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserSummaryDto } from "@ecl/shared";
import { buildApp } from "../../src/app.ts";
import { authHeader, createCleaningRecords, createEquipment, createUser } from "../helpers/fixtures.ts";

/**
 * These endpoints exist because the per-equipment ones cannot answer
 * cross-asset questions - "every record cleaned with CIP last week",
 * "everything Priya changed in March". The tests below focus on what is
 * actually new here: the additional filters and the enriched DTOs that carry
 * an equipment summary now that the URL no longer implies one.
 */

const app = buildApp();

let operator: UserSummaryDto;
let supervisor: UserSummaryDto;

beforeEach(async () => {
  operator = await createUser({ role: "OPERATOR", name: "Rahul Verma" });
  supervisor = await createUser({ role: "SUPERVISOR", name: "Priya Nair" });
});

describe("GET /api/cleaning-records (cross-equipment)", () => {
  it("narrows both rows and total to the requested equipment", async () => {
    const tankA = await createEquipment({ code: "MT-002" });
    const tankB = await createEquipment({ code: "FM-001" });
    await createCleaningRecords({ equipmentId: tankA.id, cleanedById: operator.id, count: 5 });
    await createCleaningRecords({ equipmentId: tankB.id, cleanedById: operator.id, count: 3 });

    const response = await request(app)
      .get(`/api/cleaning-records?equipmentId=${tankA.id}&limit=50`)
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.pagination.total).toBe(5);
    expect(
      response.body.data.every((r: { equipment: { id: string } }) => r.equipment.id === tankA.id),
    ).toBe(true);
    // The enriched DTO carries the equipment summary inline, so a records
    // table can render the asset column without a second fetch per row.
    expect(response.body.data[0].equipment).toMatchObject({ code: "MT-002" });
  });

  it("filters by method and by cleanedById", async () => {
    const equipmentId = (await createEquipment({ code: "MT-002" })).id;
    const otherOperator = await createUser({ role: "OPERATOR" });
    await createCleaningRecords({ equipmentId, cleanedById: operator.id, count: 3, method: "CIP" });
    await createCleaningRecords({
      equipmentId,
      cleanedById: otherOperator.id,
      count: 2,
      method: "MANUAL",
      startingAt: new Date("2026-05-01T10:00:00.000Z"),
    });

    const byMethod = await request(app)
      .get(`/api/cleaning-records?method=MANUAL&limit=50`)
      .set(authHeader(operator))
      .expect(200);
    expect(byMethod.body.pagination.total).toBe(2);

    const byOperator = await request(app)
      .get(`/api/cleaning-records?cleanedById=${otherOperator.id}&limit=50`)
      .set(authHeader(operator))
      .expect(200);
    expect(byOperator.body.pagination.total).toBe(2);
  });

  it("treats a date range as inclusive UTC day boundaries", async () => {
    const equipmentId = (await createEquipment({ code: "MT-002" })).id;
    // One record on each of five consecutive days, newest first.
    await createCleaningRecords({
      equipmentId,
      cleanedById: operator.id,
      count: 5,
      startingAt: new Date("2026-06-05T15:00:00.000Z"),
    });

    // The middle three days, inclusive on both ends.
    const response = await request(app)
      .get(`/api/cleaning-records?from=2026-06-02&to=2026-06-04&limit=50`)
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.pagination.total).toBe(3);
    const days = response.body.data.map((r: { cleanedAt: string }) => r.cleanedAt.slice(0, 10));
    expect(new Set(days)).toEqual(new Set(["2026-06-02", "2026-06-03", "2026-06-04"]));
  });

  it("rejects a range where 'from' is after 'to'", async () => {
    const response = await request(app)
      .get(`/api/cleaning-records?from=2026-06-10&to=2026-06-01`)
      .set(authHeader(operator))
      .expect(400);

    expect(response.body.error.details[0].path).toBe("to");
  });

  it("supports keyset pagination across the whole (unscoped) set", async () => {
    const equipmentId = (await createEquipment({ code: "MT-002" })).id;
    await createCleaningRecords({ equipmentId, cleanedById: operator.id, count: 12 });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const url: string = `/api/cleaning-records?mode=cursor&limit=5${cursor ? `&cursor=${cursor}` : ""}`;
      const response = await request(app).get(url).set(authHeader(operator)).expect(200);
      seen.push(...response.body.data.map((r: { id: string }) => r.id));
      cursor = response.body.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it("rejects an unauthenticated request", async () => {
    await request(app).get("/api/cleaning-records").expect(401);
  });
});

describe("GET /api/audit (compliance-wide)", () => {
  async function createAndVerify(equipmentId: string) {
    const created = await request(app)
      .post(`/api/equipment/${equipmentId}/cleaning-records`)
      .set(authHeader(operator))
      .send({ cleanedById: operator.id, cleanedAt: "2026-06-01T10:00:00.000Z", method: "CIP" })
      .expect(201);
    const recordId = created.body.data.id as string;

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${recordId}`)
      .set(authHeader(operator))
      .send({ notes: "Additional rinse performed" })
      .expect(200);

    await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${recordId}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(200);

    return recordId;
  }

  it("filters by action, and each entry carries the asset it belongs to", async () => {
    const tankA = await createEquipment({ code: "MT-002" });
    await createAndVerify(tankA.id);

    const creates = await request(app)
      .get("/api/audit?action=CREATE")
      .set(authHeader(operator))
      .expect(200);
    expect(creates.body.data).toHaveLength(1);
    expect(creates.body.data[0].equipment).toMatchObject({ code: "MT-002" });

    const updates = await request(app)
      .get("/api/audit?action=UPDATE")
      .set(authHeader(operator))
      .expect(200);
    // The notes amendment and the verification are both UPDATE entries.
    expect(updates.body.pagination.total).toBe(2);
  });

  it("filters to entries whose change set touches a given field", async () => {
    const equipmentId = (await createEquipment({ code: "MT-002" })).id;
    await createAndVerify(equipmentId);

    // The CREATE entry never mentions `notes`: `createAndVerify` sends no
    // notes, so the field is null on both sides of the diff and is correctly
    // omitted (see diffFields' "absent stays absent" rule). Only the
    // amendment PATCH actually sets it, so exactly one entry touches it.
    const byNotes = await request(app)
      .get("/api/audit?field=notes")
      .set(authHeader(operator))
      .expect(200);
    expect(byNotes.body.pagination.total).toBe(1);
    expect(byNotes.body.data[0].changes.notes).toEqual({
      old: null,
      new: "Additional rinse performed",
    });

    // Only the verification touches `verifiedById`.
    const byVerifiedBy = await request(app)
      .get("/api/audit?field=verifiedById")
      .set(authHeader(operator))
      .expect(200);
    expect(byVerifiedBy.body.pagination.total).toBe(1);
    expect(byVerifiedBy.body.data[0].action).toBe("UPDATE");
  });

  it("filters by the actor who made the change", async () => {
    const equipmentId = (await createEquipment({ code: "MT-002" })).id;
    await createAndVerify(equipmentId);

    // Only the supervisor's verification should appear.
    const response = await request(app)
      .get(`/api/audit?changedById=${supervisor.id}`)
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].changedBy.id).toBe(supervisor.id);
  });

  it("narrows to a single asset's audit trail", async () => {
    const tankA = await createEquipment({ code: "MT-002" });
    const tankB = await createEquipment({ code: "FM-001" });
    await createAndVerify(tankA.id);
    await createAndVerify(tankB.id);

    const response = await request(app)
      .get(`/api/audit?equipmentId=${tankA.id}`)
      .set(authHeader(operator))
      .expect(200);

    // 3 entries per asset (create, amend, verify); only tankA's should show.
    expect(response.body.pagination.total).toBe(3);
    expect(
      response.body.data.every((e: { equipment: { id: string } }) => e.equipment.id === tankA.id),
    ).toBe(true);
  });

  it("rejects an unauthenticated request", async () => {
    await request(app).get("/api/audit").expect(401);
  });
});

describe("GET /api/dashboard/stats", () => {
  it("reports counts that match the underlying data, and a 30-day activity series", async () => {
    const active = await createEquipment({ code: "MT-002", status: "ACTIVE" });
    await createEquipment({ code: "DR-002", status: "RETIRED" });
    await createCleaningRecords({
      equipmentId: active.id,
      cleanedById: operator.id,
      count: 6,
      status: (index) => (index < 2 ? "VERIFIED" : "PENDING"),
    });

    const response = await request(app)
      .get("/api/dashboard/stats")
      .set(authHeader(operator))
      .expect(200);

    const stats = response.body.data;
    expect(stats.equipment).toEqual({ total: 2, active: 1, retired: 1 });
    expect(stats.records).toEqual({ total: 6, pending: 4, verified: 2 });
    expect(stats.verificationBacklog).toBe(4);
    expect(stats.activity).toHaveLength(30);
    // Oldest first, one calendar day apart.
    expect(stats.activity[0].date < stats.activity[29].date).toBe(true);
  });

  it("rejects an unauthenticated request", async () => {
    await request(app).get("/api/dashboard/stats").expect(401);
  });
});
