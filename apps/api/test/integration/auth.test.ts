import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserSummaryDto } from "@ecl/shared";
import { buildApp } from "../../src/app.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { authHeader, createEquipment, createUser, TEST_PASSWORD } from "../helpers/fixtures.ts";

const app = buildApp();

let operator: UserSummaryDto;
let supervisor: UserSummaryDto;
let equipmentId: string;

beforeEach(async () => {
  operator = await createUser({ role: "OPERATOR", email: "operator@example.com" });
  supervisor = await createUser({ role: "SUPERVISOR", email: "supervisor@example.com" });
  equipmentId = (await createEquipment({ code: "MT-002" })).id;
});

describe("login", () => {
  it("issues a token for valid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator@example.com", password: TEST_PASSWORD })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: "operator@example.com", role: "OPERATOR" });
    // The hash must never leave the server.
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator@example.com", password: "nope" })
      .expect(401);

    const unknownUser = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: TEST_PASSWORD })
      .expect(401);

    // Otherwise the endpoint doubles as a way to enumerate registered emails.
    expect(wrongPassword.body).toEqual(unknownUser.body);
  });
});

describe("authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/equipment").expect(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a token signed with the wrong secret", async () => {
    // Header and payload of a valid-looking token, signature nonsense.
    await request(app)
      .get("/api/equipment")
      .set({ Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.forged" })
      .expect(401);
  });
});

describe("authorization", () => {
  it("lets only a supervisor manage the asset register", async () => {
    await request(app)
      .post("/api/equipment")
      .set(authHeader(operator))
      .send({ name: "New Tank", code: "NT-001" })
      .expect(403);

    await request(app)
      .post("/api/equipment")
      .set(authHeader(supervisor))
      .send({ name: "New Tank", code: "NT-001" })
      .expect(201);
  });

  it("lets only a supervisor verify a cleaning record", async () => {
    const created = await request(app)
      .post(`/api/equipment/${equipmentId}/cleaning-records`)
      .set(authHeader(operator))
      .send({ cleanedById: operator.id, cleanedAt: "2026-06-01T10:00:00.000Z", method: "CIP" })
      .expect(201);
    const recordId = created.body.data.id as string;

    const refused = await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${recordId}`)
      .set(authHeader(operator))
      .send({ status: "VERIFIED" })
      .expect(403);
    expect(refused.body.error.code).toBe("FORBIDDEN");

    const accepted = await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${recordId}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(200);

    expect(accepted.body.data.status).toBe("VERIFIED");
    expect(accepted.body.data.verifiedBy.id).toBe(supervisor.id);
    expect(await prisma.auditLog.count({ where: { cleaningRecordId: recordId } })).toBe(2);
  });

  it("stops a supervisor verifying a cleaning they are recorded as performing", async () => {
    const created = await request(app)
      .post(`/api/equipment/${equipmentId}/cleaning-records`)
      .set(authHeader(supervisor))
      .send({ cleanedById: supervisor.id, cleanedAt: "2026-06-01T10:00:00.000Z", method: "MANUAL" })
      .expect(201);

    // Segregation of duties: one person cannot both do the work and sign it off.
    const response = await request(app)
      .patch(`/api/equipment/${equipmentId}/cleaning-records/${created.body.data.id}`)
      .set(authHeader(supervisor))
      .send({ status: "VERIFIED" })
      .expect(403);

    expect(response.body.error.message).toMatch(/cannot verify a cleaning you/i);
  });

  it("ignores a client-supplied status on creation", async () => {
    const created = await request(app)
      .post(`/api/equipment/${equipmentId}/cleaning-records`)
      .set(authHeader(supervisor))
      .send({
        cleanedById: operator.id,
        cleanedAt: "2026-06-01T10:00:00.000Z",
        method: "CIP",
        status: "VERIFIED",
      })
      .expect(201);

    // A record always begins its life PENDING, whatever the caller asks for.
    expect(created.body.data.status).toBe("PENDING");
    expect(created.body.data.verifiedBy).toBeNull();
  });
});
