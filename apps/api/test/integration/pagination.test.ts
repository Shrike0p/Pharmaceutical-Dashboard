import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserSummaryDto } from "@ecl/shared";
import { buildApp } from "../../src/app.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { authHeader, createCleaningRecords, createEquipment, createUser } from "../helpers/fixtures.ts";

const app = buildApp();

let operator: UserSummaryDto;
let equipmentId: string;

const NEWEST = new Date("2026-06-01T10:00:00.000Z");

beforeEach(async () => {
  operator = await createUser({ role: "OPERATOR" });
  equipmentId = (await createEquipment({ code: "MT-002" })).id;
});

const listUrl = (params: string) => `/api/equipment/${equipmentId}/cleaning-records?${params}`;

describe("offset pagination", () => {
  beforeEach(async () => {
    await createCleaningRecords({
      equipmentId,
      cleanedById: operator.id,
      count: 25,
      startingAt: NEWEST,
    });
  });

  it("splits 25 records into pages of 10, 10 and 5", async () => {
    const pages = [];
    for (const page of [1, 2, 3]) {
      const response = await request(app)
        .get(listUrl(`page=${page}&limit=10`))
        .set(authHeader(operator))
        .expect(200);
      pages.push(response.body);
    }

    expect(pages.map((p) => p.data.length)).toEqual([10, 10, 5]);
    expect(pages[0].pagination).toMatchObject({
      mode: "offset",
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(pages[2].pagination).toMatchObject({ hasNextPage: false, hasPreviousPage: true });

    // Every record appears exactly once across the three pages.
    const ids = pages.flatMap((p) => p.data.map((r: { id: string }) => r.id));
    expect(new Set(ids).size).toBe(25);
  });

  it("orders records newest first", async () => {
    const response = await request(app).get(listUrl("limit=25")).set(authHeader(operator)).expect(200);

    const timestamps = response.body.data.map((r: { cleanedAt: string }) => r.cleanedAt);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  it("returns an empty page rather than an error beyond the last page", async () => {
    const response = await request(app)
      .get(listUrl("page=99&limit=10"))
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toMatchObject({ total: 25, totalPages: 3, hasNextPage: false });
  });

  it("clamps an oversized limit instead of returning the whole table", async () => {
    const response = await request(app)
      .get(listUrl("limit=100000"))
      .set(authHeader(operator))
      .expect(200);

    expect(response.body.pagination.limit).toBe(100);
  });

  it("rejects a nonsensical page number", async () => {
    await request(app).get(listUrl("page=0")).set(authHeader(operator)).expect(400);
    await request(app).get(listUrl("limit=-5")).set(authHeader(operator)).expect(400);
  });
});

describe("status filtering", () => {
  beforeEach(async () => {
    // 20 records: every third one verified -> 7 verified, 13 pending.
    await createCleaningRecords({
      equipmentId,
      cleanedById: operator.id,
      count: 20,
      startingAt: NEWEST,
      status: (index) => (index % 3 === 0 ? "VERIFIED" : "PENDING"),
    });
  });

  it("narrows both the rows and the total, not just the current page", async () => {
    const verified = await request(app)
      .get(listUrl("status=VERIFIED&limit=5"))
      .set(authHeader(operator))
      .expect(200);

    // The classic pagination bug is counting the unfiltered set: `total` here
    // must describe the filtered result, or the page controls lie.
    expect(verified.body.pagination.total).toBe(7);
    expect(verified.body.pagination.totalPages).toBe(2);
    expect(verified.body.data).toHaveLength(5);
    expect(verified.body.data.every((r: { status: string }) => r.status === "VERIFIED")).toBe(true);

    const pending = await request(app)
      .get(listUrl("status=PENDING&limit=50"))
      .set(authHeader(operator))
      .expect(200);
    expect(pending.body.pagination.total).toBe(13);
  });

  it("scopes records to their own equipment", async () => {
    const other = await createEquipment({ code: "FM-001" });
    await createCleaningRecords({
      equipmentId: other.id,
      cleanedById: operator.id,
      count: 4,
      startingAt: NEWEST,
    });

    const response = await request(app).get(listUrl("limit=50")).set(authHeader(operator)).expect(200);
    expect(response.body.pagination.total).toBe(20);
  });

  it("rejects an unknown status value", async () => {
    await request(app).get(listUrl("status=BANANA")).set(authHeader(operator)).expect(400);
  });
});

describe("keyset pagination", () => {
  beforeEach(async () => {
    await createCleaningRecords({
      equipmentId,
      cleanedById: operator.id,
      count: 25,
      startingAt: NEWEST,
    });
  });

  it("walks the whole set exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 10; guard += 1) {
      const url: string = listUrl(`mode=cursor&limit=10${cursor ? `&cursor=${cursor}` : ""}`);
      const response = await request(app).get(url).set(authHeader(operator)).expect(200);
      seen.push(...response.body.data.map((r: { id: string }) => r.id));
      cursor = response.body.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it("does not tie-break incorrectly when timestamps are identical", async () => {
    // Prisma's own `cursor` option seeks on one unique column and would drop
    // rows here; the (cleanedAt, id) tuple keeps the order total.
    const sameInstant = new Date("2026-05-01T09:00:00.000Z");
    const tied = await createEquipment({ code: "TIE-001" });
    await prisma.cleaningRecord.createMany({
      data: Array.from({ length: 6 }, () => ({
        equipmentId: tied.id,
        cleanedById: operator.id,
        cleanedAt: sameInstant,
        method: "CIP" as const,
      })),
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 6; guard += 1) {
      const url: string = `/api/equipment/${tied.id}/cleaning-records?mode=cursor&limit=2${
        cursor ? `&cursor=${cursor}` : ""
      }`;
      const response = await request(app).get(url).set(authHeader(operator)).expect(200);
      seen.push(...response.body.data.map((r: { id: string }) => r.id));
      cursor = response.body.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(6);
  });
});

/**
 * The reason both modes exist.
 *
 * Offset pagination addresses a position in a result set. When a row is
 * inserted ahead of the reader between two requests, every later row shifts
 * down one position — so the reader sees an item twice and, symmetrically on
 * deletion, misses one. Keyset pagination addresses a *value*, so an insertion
 * elsewhere in the set cannot move the reader's place.
 */
describe("offset drift versus keyset stability", () => {
  /** The six original records, newest first. */
  let originalIds: string[] = [];

  beforeEach(async () => {
    const records = await createCleaningRecords({
      equipmentId,
      cleanedById: operator.id,
      count: 6,
      startingAt: NEWEST,
    });
    originalIds = records.map((record) => record.id);
  });

  async function insertNewestRecord(): Promise<void> {
    await prisma.cleaningRecord.create({
      data: {
        equipmentId,
        cleanedById: operator.id,
        // Sorts ahead of everything already there.
        cleanedAt: new Date(NEWEST.getTime() + 86_400_000),
        method: "MANUAL",
        notes: "Inserted between page reads",
      },
    });
  }

  it("offset repeats a row when a record is inserted between page reads", async () => {
    const page1 = await request(app)
      .get(listUrl("page=1&limit=2"))
      .set(authHeader(operator))
      .expect(200);
    const firstPageIds = page1.body.data.map((r: { id: string }) => r.id);

    await insertNewestRecord();

    const page2 = await request(app)
      .get(listUrl("page=2&limit=2"))
      .set(authHeader(operator))
      .expect(200);
    const secondPageIds = page2.body.data.map((r: { id: string }) => r.id);

    // Everything shifted down by one, so page 2 now starts on the row the
    // reader already saw at the bottom of page 1 — specifically that row, not
    // just "some" overlap. This is the documented weakness of offset
    // pagination, not a bug in this implementation.
    expect(firstPageIds).toEqual(originalIds.slice(0, 2));
    expect(secondPageIds[0]).toBe(originalIds[1]);
    expect(secondPageIds.filter((id: string) => firstPageIds.includes(id))).toEqual([originalIds[1]]);
  });

  it("keyset returns the correct next rows under the same insertion", async () => {
    const page1 = await request(app)
      .get(listUrl("mode=cursor&limit=2"))
      .set(authHeader(operator))
      .expect(200);
    const firstPageIds = page1.body.data.map((r: { id: string }) => r.id);
    const cursor = page1.body.pagination.nextCursor as string;

    await insertNewestRecord();

    const page2 = await request(app)
      .get(listUrl(`limit=2&cursor=${cursor}`))
      .set(authHeader(operator))
      .expect(200);
    const secondPageIds = page2.body.data.map((r: { id: string }) => r.id);

    // The cursor anchors on the last row of page 1, so the insertion ahead of
    // it is simply not in scope: no repeats, no skips.
    expect(firstPageIds).toEqual(originalIds.slice(0, 2));
    expect(secondPageIds.filter((id: string) => firstPageIds.includes(id))).toHaveLength(0);

    // ...and page 2 is exactly the two rows that genuinely follow page 1 in the
    // original ordering. The record inserted at the top is correctly not here:
    // the reader is partway through the set and does not go backwards for it.
    expect(secondPageIds).toEqual(originalIds.slice(2, 4));
  });
});
