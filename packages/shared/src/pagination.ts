import { z } from "zod";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const PAGINATION_MODES = ["offset", "cursor"] as const;
export const paginationModeSchema = z.enum(PAGINATION_MODES);
export type PaginationMode = z.infer<typeof paginationModeSchema>;

/**
 * One query schema serves both pagination modes:
 *   - `mode=offset` (the default) -> driven by `page`
 *   - `mode=cursor`               -> keyset; the first page needs no `cursor`,
 *                                    subsequent pages pass the `nextCursor`
 *                                    returned by the previous response
 *
 * Supplying a `cursor` implies `mode=cursor`, so a caller following
 * `nextCursor` links does not have to keep repeating the mode.
 *
 * `limit` is clamped rather than rejected at the top end so a client asking for
 * 10_000 rows gets 100 back instead of a 400 it has to special-case.
 */
export const paginationQuerySchema = z.object({
  mode: paginationModeSchema.default("offset"),
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
