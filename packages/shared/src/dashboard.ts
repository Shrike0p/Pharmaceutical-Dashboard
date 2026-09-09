import type { GlobalAuditEntryDto } from "./audit";

/**
 * Feeds the Overview page's stat tiles and activity chart. Deliberately a
 * single read-model endpoint rather than making the client compose five
 * separate list calls just to render four numbers and a sparkline.
 */
export interface DashboardStatsDto {
  equipment: {
    total: number;
    active: number;
    retired: number;
  };
  records: {
    total: number;
    pending: number;
    verified: number;
  };
  /**
   * Equal to `records.pending`, exposed under its own name because it is the
   * one number the UI treats as an actionable backlog (it links straight to
   * the records view pre-filtered to PENDING) rather than a plain count.
   */
  verificationBacklog: number;
  /** One point per day, oldest first, covering the last 30 days. */
  activity: DashboardActivityPointDto[];
  /** Most recent global audit entries, newest first. */
  recentAuditEntries: GlobalAuditEntryDto[];
}

export interface DashboardActivityPointDto {
  /** Calendar date, `YYYY-MM-DD`, in UTC. */
  date: string;
  recordsCreated: number;
  recordsVerified: number;
}
