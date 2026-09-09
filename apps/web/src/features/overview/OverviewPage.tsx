import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CLEANING_METHOD_LABELS } from "@ecl/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/data-states";
import { useDashboardStats } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";

function StatTile({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number;
  to?: string;
  tone?: "default" | "pending";
}) {
  const content = (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={
            tone === "pending" && value > 0
              ? "text-2xl font-semibold tabular-nums text-pending-700"
              : "text-2xl font-semibold tabular-nums text-foreground"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-xl transition-shadow hover:shadow-md">
      {content}
    </Link>
  ) : (
    content
  );
}

export function OverviewPage() {
  const stats = useDashboardStats();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Equipment status, verification backlog, and recent compliance activity.
        </p>
      </div>

      {stats.isPending ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : stats.isError ? (
        <Card>
          <ErrorState message={(stats.error as Error).message} onRetry={() => void stats.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Equipment" value={stats.data.equipment.total} to="/app/equipment" />
            <StatTile
              label="Pending verification"
              value={stats.data.verificationBacklog}
              to="/app/records?status=PENDING"
              tone="pending"
            />
            <StatTile label="Verified records" value={stats.data.records.verified} to="/app/records?status=VERIFIED" />
            <StatTile label="Total cleaning records" value={stats.data.records.total} to="/app/records" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Activity, last 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.data.activity} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-navy-700)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-navy-700)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="verified" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-verify-600)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-verify-600)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value: string) => value.slice(5)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        interval={4}
                        stroke="var(--color-steel-500)"
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          borderColor: "var(--border)",
                          fontSize: 12,
                        }}
                        labelFormatter={(label) =>
                          typeof label === "string"
                            ? formatDateTime(`${label}T00:00:00.000Z`).split(",")[0]
                            : label
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="recordsCreated"
                        name="Recorded"
                        stroke="var(--color-navy-700)"
                        fill="url(#created)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="recordsVerified"
                        name="Verified"
                        stroke="var(--color-verify-600)"
                        fill="url(#verified)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent audit activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.data.recentAuditEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  stats.data.recentAuditEntries.map((entry) => (
                    <Link
                      key={entry.id}
                      to={`/app/equipment/${entry.equipment.id}`}
                      className="block rounded-md px-1 py-1 text-sm hover:bg-accent"
                    >
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
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
