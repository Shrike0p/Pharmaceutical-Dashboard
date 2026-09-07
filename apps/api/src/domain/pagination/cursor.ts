import { z } from "zod";
import type { CursorPaginationMeta, OffsetPaginationMeta } from "@ecl/shared";
import { ValidationError } from "../../errors/app-error.ts";

/**
 * Keyset pagination anchors on the last row of the previous page rather than on
 * a row offset, so inserting or deleting rows mid-iteration cannot make the
 * reader skip or repeat an item.
 *
 * `cleanedAt` alone is not unique — two cleanings can share a timestamp — so the
 * cursor carries the id as a tie-breaker and the query orders by both.
 */
export interface RecordCursor {
  cleanedAt: string;
  id: string;
}

const cursorPayloadSchema = z.object({
  cleanedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  id: z.string().min(1),
});

/**
 * The cursor is base64url of a tiny JSON payload. It is opaque rather than
 * secret: it encodes only values the caller can already see in the response, so
 * it is deliberately not signed. Anything a tampered cursor could express, a
 * caller could equally express with a filter.
 */
export function encodeCursor(cursor: RecordCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): RecordCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid pagination cursor", [
      { path: "cursor", message: "Cursor is malformed" },
    ]);
  }

  const result = cursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError("Invalid pagination cursor", [
      { path: "cursor", message: "Cursor is malformed" },
    ]);
  }
  return result.data;
}

export function buildOffsetMeta(page: number, limit: number, total: number): OffsetPaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    mode: "offset",
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };
}

export function buildCursorMeta(limit: number, nextCursor: string | null): CursorPaginationMeta {
  return {
    mode: "cursor",
    limit,
    nextCursor,
    hasNextPage: nextCursor !== null,
  };
}
