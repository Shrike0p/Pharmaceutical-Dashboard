import { z } from "zod";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

/**
 * One query schema serves both pagination modes:
 *   - no `cursor`  -> offset mode, driven by `page`
 *   - `cursor` set -> keyset mode, `page` is ignored
 *
 * `limit` is clamped rather than rejected at the top end so a client asking for
 * 10_000 rows gets 100 back instead of a 400 it has to special-case.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, PAGINATION_MAX_LIMIT))
    .default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface OffsetPaginationMeta {
  mode: "offset";
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CursorPaginationMeta {
  mode: "cursor";
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export type PaginationMeta = OffsetPaginationMeta | CursorPaginationMeta;

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export function isOffsetMeta(meta: PaginationMeta): meta is OffsetPaginationMeta {
  return meta.mode === "offset";
}
