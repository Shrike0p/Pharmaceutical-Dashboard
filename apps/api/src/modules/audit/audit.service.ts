import type { AuditListQuery, ChangeSet, GlobalAuditEntryDto, Paginated } from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { buildOffsetMeta } from "../../domain/pagination/cursor.ts";
import { toUtcDayRange } from "../../domain/filters/date-range.ts";
import { userSummarySelect } from "../auth/auth.service.ts";
import { Prisma } from "../../generated/prisma/client.ts";

const globalAuditInclude = {
  changedBy: { select: userSummarySelect },
  cleaningRecord: {
    select: {
      cleanedAt: true,
      equipment: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.AuditLogInclude;

type GlobalAuditRow = Prisma.AuditLogGetPayload<{ include: typeof globalAuditInclude }>;

function toDto(row: GlobalAuditRow): GlobalAuditEntryDto {
  return {
    id: row.id,
    cleaningRecordId: row.cleaningRecordId,
    action: row.action,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
    changes: (row.changes ?? {}) as ChangeSet,
    reason: row.reason,
    equipment: row.cleaningRecord.equipment,
    cleaningRecord: { cleanedAt: row.cleaningRecord.cleanedAt.toISOString() },
  };
}

/**
 * The compliance-wide trail: "what did Priya change in March", "every status
 * transition on Mixing Tank 02" - questions the per-record audit endpoint
 * cannot answer because it always starts from one already-known record.
 *
 * Offset pagination only (no keyset mode): this is a bounded report a
 * compliance reviewer pages through with a known total, not a feed to scroll
 * indefinitely, so `total`/`totalPages` matter more here than under
 * concurrent-insert stability.
 */
export async function listGlobalAuditHistory(
  query: AuditListQuery,
): Promise<Paginated<GlobalAuditEntryDto>> {
  const changedAtRange = toUtcDayRange(query.from, query.to);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.changedById ? { changedById: query.changedById } : {}),
    ...(query.equipmentId ? { cleaningRecord: { equipmentId: query.equipmentId } } : {}),
    // "Does the change set contain this key" - verified against the seeded
    // data to behave exactly like Postgres's native `changes ? 'field'`
    // containment operator: a path that resolves to SQL NULL (the key is
    // absent) is excluded by `not: Prisma.DbNull`.
    ...(query.field ? { changes: { path: [query.field], not: Prisma.DbNull } } : {}),
    ...(changedAtRange.gte || changedAtRange.lte ? { changedAt: changedAtRange } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: globalAuditInclude,
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: rows.map(toDto), pagination: buildOffsetMeta(query.page, query.limit, total) };
}
