import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserSummaryDto } from "@ecl/shared";
import { buildApp } from "../../src/app.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { authHeader, createUser, TEST_PASSWORD } from "../helpers/fixtures.ts";

const app = buildApp();

let operator: UserSummaryDto;
let supervisor: UserSummaryDto;

beforeEach(async () => {
  operator = await createUser({ role: "OPERATOR", email: "operator@example.com" });
  supervisor = await createUser({ role: "SUPERVISOR", email: "supervisor@example.com" });
});

describe("account provisioning", () => {
  it("is refused to anyone but a supervisor", async () => {
    await request(app)
      .post("/api/users")
      .set(authHeader(operator))
      .send({ name: "New Person", email: "new@example.com", role: "OPERATOR", password: "correct-horse-1" })
      .expect(403);
  });

  it("lets a supervisor create an account that can immediately sign in", async () => {
    const created = await request(app)
      .post("/api/users")
      .set(authHeader(supervisor))
      .send({
        name: "Kavya Menon",
        email: "kavya.menon@example.com",
        role: "OPERATOR",
        password: "correct-horse-battery",
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      name: "Kavya Menon",
      email: "kavya.menon@example.com",
      role: "OPERATOR",
      isActive: true,
    });
    // The password itself must never come back in the response.
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|battery/);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "kavya.menon@example.com", password: "correct-horse-battery" })
      .expect(200);
    expect(login.body.user.email).toBe("kavya.menon@example.com");
  });

  it("rejects a duplicate email with a field-level 409", async () => {
    const response = await request(app)
      .post("/api/users")
      .set(authHeader(supervisor))
      .send({
        name: "Duplicate",
        email: operator.email,
        role: "OPERATOR",
        password: "correct-horse-battery",
      })
      .expect(409);

    expect(response.body.error.details[0].path).toBe("email");
  });

  it("rejects a weak password", async () => {
    await request(app)
      .post("/api/users")
      .set(authHeader(supervisor))
      .send({ name: "Weak", email: "weak@example.com", role: "OPERATOR", password: "short" })
      .expect(400);
  });
});

describe("account deactivation", () => {
  it("lets a supervisor deactivate another account, and that account can no longer log in", async () => {
    const target = await createUser({ role: "OPERATOR", email: "target@example.com" });

    const response = await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeader(supervisor))
      .send({ isActive: false })
      .expect(200);
    expect(response.body.data.isActive).toBe(false);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "target@example.com", password: TEST_PASSWORD })
      .expect(403);
    expect(login.body.error.message).toMatch(/deactivated/i);
  });

  it("refuses to let a supervisor deactivate their own account", async () => {
    const response = await request(app)
      .patch(`/api/users/${supervisor.id}`)
      .set(authHeader(supervisor))
      .send({ isActive: false })
      .expect(403);

    expect(response.body.error.message).toMatch(/cannot deactivate your own account/i);

    // Confirmed unchanged: not just the response, the account is still active.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: supervisor.id } });
    expect(user.deactivatedAt).toBeNull();
  });

  it("reactivates a deactivated account", async () => {
    const target = await createUser({ role: "OPERATOR", email: "reactivate@example.com" });
    await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeader(supervisor))
      .send({ isActive: false })
      .expect(200);

    const response = await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeader(supervisor))
      .send({ isActive: true })
      .expect(200);
    expect(response.body.data.isActive).toBe(true);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "reactivate@example.com", password: TEST_PASSWORD })
      .expect(200);
  });

  it("is refused to anyone but a supervisor", async () => {
    const target = await createUser({ role: "OPERATOR" });
    await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeader(operator))
      .send({ isActive: false })
      .expect(403);
  });
});

describe("account listing", () => {
  it("filters by role and by active status", async () => {
    await createUser({ role: "OPERATOR", email: "op2@example.com" });
    const deactivated = await createUser({ role: "OPERATOR", email: "op3@example.com" });
    await request(app)
      .patch(`/api/users/${deactivated.id}`)
      .set(authHeader(supervisor))
      .send({ isActive: false })
      .expect(200);

    const operators = await request(app)
      .get("/api/users?role=OPERATOR&limit=50")
      .set(authHeader(supervisor))
      .expect(200);
    expect(operators.body.data.every((u: { role: string }) => u.role === "OPERATOR")).toBe(true);

    const active = await request(app)
      .get("/api/users?isActive=true&limit=50")
      .set(authHeader(supervisor))
      .expect(200);
    expect(active.body.data.some((u: { email: string }) => u.email === "op3@example.com")).toBe(false);

    const inactive = await request(app)
      .get("/api/users?isActive=false&limit=50")
      .set(authHeader(supervisor))
      .expect(200);
    expect(inactive.body.data.map((u: { email: string }) => u.email)).toEqual(["op3@example.com"]);
  });

  it("is refused to anyone but a supervisor", async () => {
    await request(app).get("/api/users").set(authHeader(operator)).expect(403);
  });
});

describe("changing your own password", () => {
  it("requires the correct current password", async () => {
    const response = await request(app)
      .post("/api/auth/password")
      .set(authHeader(operator))
      .send({ currentPassword: "wrong-password", newPassword: "a-brand-new-password" })
      .expect(400);
    expect(response.body.error.details[0].path).toBe("currentPassword");
  });

  it("changes the password, which takes effect on the next login", async () => {
    await request(app)
      .post("/api/auth/password")
      .set(authHeader(operator))
      .send({ currentPassword: TEST_PASSWORD, newPassword: "a-brand-new-password" })
      .expect(204);

    await request(app)
      .post("/api/auth/login")
      .send({ email: operator.email, password: TEST_PASSWORD })
      .expect(401);

    await request(app)
      .post("/api/auth/login")
      .send({ email: operator.email, password: "a-brand-new-password" })
      .expect(200);
  });

  it("rejects a new password identical to the current one", async () => {
    await request(app)
      .post("/api/auth/password")
      .set(authHeader(operator))
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
      .expect(400);
  });
});
