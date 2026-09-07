import { describe, expect, it } from "vitest";
import {
  buildCursorMeta,
  buildOffsetMeta,
  decodeCursor,
  encodeCursor,
} from "../../src/domain/pagination/cursor.ts";
import { AppError } from "../../src/errors/app-error.ts";

describe("buildOffsetMeta", () => {
  it("computes page counts for a partial final page", () => {
    expect(buildOffsetMeta(1, 10, 25)).toEqual({
      mode: "offset",
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("reports the last page as having no next page", () => {
    const meta = buildOffsetMeta(3, 10, 25);
    expect(meta).toMatchObject({ page: 3, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
  });

  it("does not invent an extra page when the total divides exactly", () => {
    // 30 items at 10 per page is 3 pages, not 4 — the classic off-by-one.
    expect(buildOffsetMeta(3, 10, 30)).toMatchObject({ totalPages: 3, hasNextPage: false });
  });

  it("reports zero pages for an empty result rather than one empty page", () => {
    expect(buildOffsetMeta(1, 10, 0)).toMatchObject({
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it("handles a page beyond the end without claiming a next page", () => {
    expect(buildOffsetMeta(9, 10, 25)).toMatchObject({
      page: 9,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });
});

describe("buildCursorMeta", () => {
  it("reports a next page exactly when a cursor was produced", () => {
    expect(buildCursorMeta(10, "abc")).toEqual({
      mode: "cursor",
      limit: 10,
      nextCursor: "abc",
      hasNextPage: true,
    });
    expect(buildCursorMeta(10, null)).toMatchObject({ nextCursor: null, hasNextPage: false });
  });
});

describe("cursor encoding", () => {
  const cursor = { cleanedAt: "2026-09-01T10:00:00.000Z", id: "01a07da1-f9a9-77f6-9255-a7f5a95e312d" };

  it("round-trips a cursor", () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("produces a URL-safe token", () => {
    // base64url only: no +, / or = to be mangled in a query string.
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a malformed cursor with a 400 rather than crashing", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrowError(AppError);
    try {
      decodeCursor("not-a-cursor");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects a well-formed base64 payload that is not a valid cursor", () => {
    const bogus = Buffer.from(JSON.stringify({ cleanedAt: "yesterday" }), "utf8").toString("base64url");
    expect(() => decodeCursor(bogus)).toThrowError(AppError);
  });
});
