/**
 * Converts a `from`/`to` calendar-day filter (validated upstream by
 * `z.iso.date()`, so always `YYYY-MM-DD` or absent) into UTC instant bounds
 * for a Prisma `gte`/`lte` comparison.
 *
 * `from` is treated as the start of that day and `to` as its end, both UTC.
 * A day-level filter is a coarse "which days" question - it pairs with a
 * date-range picker in the UI - rather than a precise instant, so there is no
 * timezone parameter here; the boundary is always UTC midnight.
 */
export function toUtcDayRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) range.lte = new Date(`${to}T23:59:59.999Z`);
  return range;
}
