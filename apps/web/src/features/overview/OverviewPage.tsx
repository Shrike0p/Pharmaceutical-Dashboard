import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, CircleCheckBig, ClipboardList, ShieldCheck, TrendingUp, Wrench } from "lucide-react";
import { CLEANING_METHOD_LABELS, type EquipmentDto } from "@ecl/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/data-states";
import { useDashboardStats, useEquipmentList } from "@/hooks/queries";
import { formatDateTime, formatIsoDay, initials } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const GradientCanvas = lazy(() =>
  import("@/components/three/GradientCanvas").then((module) => ({ default: module.GradientCanvas })),
);

/**
 * Series colours are the app's own status tokens, not a decorative pair: a
 * cleaning is *recorded* into PENDING and later becomes VERIFIED, so the chart
 * reads with the same two colours as every status badge in the app. It is also
 * the pair that passes CVD separation — the earlier coral/green pairing sat at
 * ΔE 4.4 for deuteranopia, i.e. one colour to a red-green colourblind reader.
 */
const SERIES = {
  recorded: "var(--color-pending-600)",
  verified: "var(--color-verify-700)",
} as const;

/** Fades and rises into place as it scrolls into view — once, not on every re-render. */
function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A 12-point trend line for a stat tile. Hand-drawn as one SVG path rather
 * than a charting component — at this size a library's axes, margins and
 * responsive container are all overhead for something that is really just a
 * glyph.
 */
function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const step = 100 / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    // 2px of headroom top and bottom so the stroke is never clipped.
    const y = 26 - (value / max) * 22;
    return { x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const last = points.at(-1);

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {last ? <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

type Tone = "brand" | "verify" | "stone";

const TONE_STYLES: Record<Tone, { icon: string; wash: string; spark: string }> = {
  brand: { icon: "bg-brand-700 text-white", wash: "from-brand-600/[0.07]", spark: "var(--color-brand-600)" },
  verify: { icon: "bg-verify-50 text-verify-700", wash: "from-verify-600/[0.08]", spark: SERIES.verified },
  stone: { icon: "bg-muted text-muted-foreground", wash: "from-stone-500/[0.06]", spark: "var(--color-stone-500)" },
};

function StatTile({
  label,
  value,
  to,
  tone,
  icon: Icon,
  detail,
  spark,
}: {
  label: string;
  value: number;
  to: string;
  tone: Tone;
  icon: typeof Wrench;
  /** A real, derived-from-data line — never a fabricated trend number. */
  detail: string;
  spark?: number[];
}) {
  const styles = TONE_STYLES[tone];
  return (
    <Link to={to} className="pop-on-hover block h-full rounded-xl">
      <Card className="relative h-full overflow-hidden">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-linear-to-br ${styles.wash} to-transparent`}
        />
        <CardContent className="relative flex h-full flex-col gap-3">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">{label}</p>
            <span className={`flex size-8 items-center justify-center rounded-lg ${styles.icon}`}>
              <Icon className="size-4" />
            </span>
          </div>
          {/* Proportional figures, not tabular — equal-width digits make a
              number this size look loose. */}
          <p className="font-heading text-4xl font-bold text-foreground">{value}</p>
          <p className="mt-auto text-xs text-muted-foreground">{detail}</p>
          {spark ? <Sparkline values={spark} stroke={styles.spark} /> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Verification completeness as a meter rather than a two-slice donut — a pie
 * with two segments is a stat tile wearing a costume, and the exact figures
 * matter more here than the shape does.
 */
function VerificationMeter({
  verified,
  pending,
  verifiedThisWeek,
}: {
  verified: number;
  pending: number;
  verifiedThisWeek: number;
}) {
  const total = verified + pending;
  const share = total === 0 ? 0 : verified / total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Verification completeness
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <span className="font-heading text-4xl font-bold text-foreground">
            {Math.round(share * 100)}%
          </span>
          <span className="pb-1 text-sm text-muted-foreground">of records verified</span>
        </div>

        {/* The unfilled track is a lighter step of the same green ramp, so the
            whole bar reads as one measure rather than two colours meeting. */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-verify-50">
          <div
            className="h-full rounded-full bg-verify-700 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(share * 100, total === 0 ? 0 : 1.5)}%` }}
            role="meter"
            aria-valuenow={verified}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Records verified"
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-verify-50 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-verify-700">
              <span className="size-2 rounded-full bg-verify-700" />
              Verified
            </dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-foreground">{verified}</dd>
          </div>
          <div className="rounded-xl bg-pending-50 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-pending-700">
              <span className="size-2 rounded-full bg-pending-600" />
              Pending
            </dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums text-foreground">{pending}</dd>
          </div>
        </dl>

        <p className="border-t pt-3 text-xs text-muted-foreground">
          {verifiedThisWeek > 0
            ? `${verifiedThisWeek} verified in the last 7 days.`
            : "Nothing verified in the last 7 days."}{" "}
          Only a supervisor can verify, and never their own cleaning.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Cleanings per asset, ranked. One hue for every column: the categories are
 * nominal, so colouring them individually would burn the only free encoding
 * channel on information the column heights already carry.
 */
function TopAssetsChart({ assets }: { assets: EquipmentDto[] }) {
  const max = Math.max(...assets.map((asset) => asset.cleaningRecordCount), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          Cleanings by asset
        </CardTitle>
      </CardHeader>
      {/* flex-1 on the content, and the plot inside it, so the columns grow to
          fill whatever height the row's tallest card sets. */}
      <CardContent className="flex flex-1 flex-col">
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No equipment recorded yet.</p>
        ) : (
          <div className="flex min-h-48 flex-1 items-end justify-between gap-2">
            {assets.map((asset) => (
              <Link
                key={asset.id}
                to={`/app/equipment/${asset.id}`}
                title={`${asset.name} — ${asset.cleaningRecordCount} cleanings`}
                className="group flex h-full min-w-0 flex-1 origin-bottom flex-col items-center justify-end gap-2 rounded-lg outline-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.06] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {asset.cleaningRecordCount}
                </span>
                {/* Capped at 24px: the leftover band width is deliberate air,
                    not a bar waiting to be widened. */}
                <span
                  className="w-full max-w-6 rounded-t-[4px] bg-brand-600 transition-colors group-hover:bg-brand-700"
                  style={{ height: `${Math.max((asset.cleaningRecordCount / max) * 100, 2)}%` }}
                />
                <span className="w-full truncate text-center font-mono text-[10px] text-muted-foreground">
                  {asset.code}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The dashboard's one hero figure: the single number that implies an action.
 * Everything else on the page is context for it.
 */
function HeroBand({ backlog }: { backlog: number }) {
  const { user } = useAuth();
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-shell-950">
      <Suspense fallback={null}>
        <GradientCanvas palette="shell" className="absolute inset-0" />
      </Suspense>
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-shell-950/90 via-shell-950/55 to-shell-950/10" />

      <div className="relative flex flex-col gap-6 p-7 sm:p-9 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-white/60">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <p className="mt-4 text-xs font-semibold tracking-wide text-white/60 uppercase">
            Verification backlog
          </p>
          <div className="mt-1 flex items-end gap-3">
            <span className="font-heading text-6xl leading-none font-bold text-white">{backlog}</span>
            <span className="pb-1.5 text-sm text-white/70">
              {backlog === 1 ? "record awaiting" : "records awaiting"}
              <br />
              supervisor review
            </span>
          </div>
        </div>

        <Button
          asChild
          className="group/cta h-11 w-fit gap-2 rounded-full bg-white px-5 text-base text-ink-900 shadow-none hover:bg-white/90"
        >
          <Link to="/app/records?status=PENDING">
            Review pending
            <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const stats = useDashboardStats();
  // Sorted client-side: the list endpoint orders by code, and a "top assets"
  // ranking is not worth a second server-side read model at this size.
  const equipment = useEquipmentList({ page: 1, limit: 100 });
  const topAssets = [...(equipment.data?.data ?? [])]
    .sort((a, b) => b.cleaningRecordCount - a.cleaningRecordCount)
    .slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Equipment status, verification backlog, and recent compliance activity.
        </p>
      </div>

      {stats.isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-3xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      ) : stats.isError ? (
        <Card>
          <ErrorState message={(stats.error as Error).message} onRetry={() => void stats.refetch()} />
        </Card>
      ) : (
        (() => {
          const activity = stats.data.activity;
          const lastWeek = activity.slice(-7);
          const createdThisWeek = lastWeek.reduce((sum, day) => sum + day.recordsCreated, 0);
          const verifiedThisWeek = lastWeek.reduce((sum, day) => sum + day.recordsVerified, 0);
          const lastTwelve = activity.slice(-12);

          return (
            <>
              <Reveal>
                <HeroBand backlog={stats.data.verificationBacklog} />
              </Reveal>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Reveal delay={0.05}>
                  <StatTile
                    label="Equipment"
                    value={stats.data.equipment.total}
                    to="/app/equipment"
                    tone="brand"
                    icon={Wrench}
                    detail={`${stats.data.equipment.active} active · ${stats.data.equipment.retired} retired`}
                  />
                </Reveal>
                <Reveal delay={0.1}>
                  <StatTile
                    label="Verified records"
                    value={stats.data.records.verified}
                    to="/app/records?status=VERIFIED"
                    tone="verify"
                    icon={CircleCheckBig}
                    detail={verifiedThisWeek > 0 ? `+${verifiedThisWeek} this week` : "None verified this week"}
                    spark={lastTwelve.map((day) => day.recordsVerified)}
                  />
                </Reveal>
                <Reveal delay={0.15}>
                  <StatTile
                    label="Total cleaning records"
                    value={stats.data.records.total}
                    to="/app/records"
                    tone="stone"
                    icon={ClipboardList}
                    detail={createdThisWeek > 0 ? `+${createdThisWeek} this week` : "None recorded this week"}
                    spark={lastTwelve.map((day) => day.recordsCreated)}
                  />
                </Reveal>
              </div>

              {/* items-start: the meter is shorter than the chart beside it,
                  and stretching it would only add a void under its content. */}
              <div className="grid items-start gap-4 lg:grid-cols-3">
                <Reveal delay={0.2} className="lg:col-span-2">
                  <Card className="h-full">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="size-4 text-muted-foreground" />
                        Activity, last 30 days
                      </CardTitle>
                      {/* Two series, so a legend is mandatory — identity can
                          never rest on colour alone. */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-pending-600" /> Recorded
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-verify-700" /> Verified
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={activity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="recordedFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={SERIES.recorded} stopOpacity={0.14} />
                                <stop offset="100%" stopColor={SERIES.recorded} stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="verifiedFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={SERIES.verified} stopOpacity={0.14} />
                                <stop offset="100%" stopColor={SERIES.verified} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            {/* Solid hairlines, one step off the surface — dashed
                                grids read as thresholds. */}
                            <CartesianGrid
                              horizontal
                              vertical={false}
                              stroke="var(--border)"
                              strokeWidth={1}
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(value: string) => value.slice(5)}
                              tickLine={false}
                              axisLine={false}
                              fontSize={11}
                              interval={4}
                              stroke="var(--color-stone-500)"
                            />
                            {/* The axis is what keeps values readable without
                                hovering — a tooltip must never be the only way. */}
                            <YAxis
                              allowDecimals={false}
                              tickLine={false}
                              axisLine={false}
                              fontSize={11}
                              width={28}
                              stroke="var(--color-stone-500)"
                            />
                            <Tooltip
                              cursor={{ stroke: "var(--color-stone-500)", strokeWidth: 1 }}
                              contentStyle={{
                                borderRadius: 12,
                                borderColor: "var(--border)",
                                boxShadow: "var(--shadow-popover)",
                                fontSize: 12,
                              }}
                              labelFormatter={(label) =>
                                typeof label === "string"
                                  ? formatIsoDay(label)
                                  : label
                              }
                            />
                            <Area
                              type="monotone"
                              dataKey="recordsCreated"
                              name="Recorded"
                              stroke={SERIES.recorded}
                              fill="url(#recordedFill)"
                              strokeWidth={2}
                              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                            />
                            <Area
                              type="monotone"
                              dataKey="recordsVerified"
                              name="Verified"
                              stroke={SERIES.verified}
                              fill="url(#verifiedFill)"
                              strokeWidth={2}
                              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </Reveal>

                <Reveal delay={0.25}>
                  <VerificationMeter
                    verified={stats.data.records.verified}
                    pending={stats.data.records.pending}
                    verifiedThisWeek={verifiedThisWeek}
                  />
                </Reveal>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Reveal delay={0.3}>
                  <TopAssetsChart assets={topAssets} />
                </Reveal>

                <Reveal delay={0.35} className="lg:col-span-2">
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Recent audit activity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0.5">
                      {stats.data.recentAuditEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
                      ) : (
                        stats.data.recentAuditEntries.slice(0, 6).map((entry) => (
                          <Link
                            key={entry.id}
                            to={`/app/equipment/${entry.equipment.id}`}
                            className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent"
                          >
                            <Avatar className="mt-0.5 size-6 shrink-0">
                              <AvatarFallback className="text-[10px]">
                                {initials(entry.changedBy.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-foreground">
                                <span className="font-medium">{entry.changedBy.name}</span>{" "}
                                {entry.action === "CREATE" ? "recorded a cleaning" : "updated a record"} on{" "}
                                <span className="font-medium">{entry.equipment.code}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.changedAt)}
                                {Object.keys(entry.changes).includes("method")
                                  ? ` · ${CLEANING_METHOD_LABELS[entry.changes["method"]?.new as keyof typeof CLEANING_METHOD_LABELS]}`
                                  : ""}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </Reveal>
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
