import type { DashboardActivityPointDto, DashboardStatsDto } from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { listGlobalAuditHistory } from "../audit/audit.service.ts";

const ACTIVITY_WINDOW_DAYS = 30;
const RECENT_AUDIT_LIMIT = 8;

interface DayCount {
  day: Date;
  count: bigint | number;
}

/** `YYYY-MM-DD` for a UTC instant, used as the join key across both series. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildEmptySeries(windowStart: Date): Map<string, DashboardActivityPointDto> {
  const series = new Map<string, DashboardActivityPointDto>();
  for (let offset = 0; offset < ACTIVITY_WINDOW_DAYS; offset += 1) {
    const date = new Date(windowStart.getTime() + offset * 86_400_000);
    const key = dayKey(date);
    series.set(key, { date: key, recordsCreated: 0, recordsVerified: 0 });
  }
  return series;
}

/**
 * Feeds the Overview page: asset and record counts, the verification
 * backlog, a 30-day activity series, and the most recent global audit
 * entries. One endpoint rather than five separate list calls just to render
 * four numbers and a sparkline.
 */
export async function getDashboardStats(): Promise<DashboardStatsDto> {
  const windowStart = new Date(Date.now() - (ACTIVITY_WINDOW_DAYS - 1) * 86_400_000);
  const windowStartOfDay = new Date(`${dayKey(windowStart)}T00:00:00.000Z`);

  const [
    equipmentTotal,
    equipmentActive,
    recordsTotal,
    recordsPending,
    createdByDay,
    verifiedByDay,
    recentAudit,
  ] = await Promise.all([
    prisma.equipment.count(),
    prisma.equipment.count({ where: { status: "ACTIVE" } }),
    prisma.cleaningRecord.count(),
    prisma.cleaningRecord.count({ where: { status: "PENDING" } }),
    // Prisma has no `GROUP BY date_trunc`, so this one aggregation drops to
    // raw SQL - the same principle already applied elsewhere in this codebase
    // (the audit-immutability trigger, the seed's TRUNCATE) of reaching for
    // raw SQL only where Prisma genuinely cannot express the query.
    prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', "created_at") AS day, count(*)::int AS count
      FROM cleaning_records
      WHERE "created_at" >= ${windowStartOfDay}
      GROUP BY day
    `,
    prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', "changed_at") AS day, count(*)::int AS count
      FROM audit_logs
      WHERE "action" = 'UPDATE'
        AND "changes" ? 'status'
        AND "changes"->'status'->>'new' = 'VERIFIED'
        AND "changed_at" >= ${windowStartOfDay}
      GROUP BY day
    `,
    listGlobalAuditHistory({ page: 1, limit: RECENT_AUDIT_LIMIT, mode: "offset" }),
  ]);

  const series = buildEmptySeries(windowStartOfDay);
  for (const row of createdByDay) {
    const point = series.get(dayKey(row.day));
    if (point) point.recordsCreated = Number(row.count);
  }
  for (const row of verifiedByDay) {
    const point = series.get(dayKey(row.day));
    if (point) point.recordsVerified = Number(row.count);
  }

  return {
    equipment: {
      total: equipmentTotal,
      active: equipmentActive,
      retired: equipmentTotal - equipmentActive,
    },
    records: {
      total: recordsTotal,
      pending: recordsPending,
      verified: recordsTotal - recordsPending,
    },
    verificationBacklog: recordsPending,
    activity: Array.from(series.values()),
    recentAuditEntries: recentAudit.data,
  };
}
