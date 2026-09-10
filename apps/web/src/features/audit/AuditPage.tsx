import { Link, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { AUDIT_ACTIONS, AUDITED_FIELD_LABELS, isOffsetMeta, type AuditAction } from "@ecl/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { OffsetPager } from "@/components/OffsetPager";
import { useEquipmentList, useGlobalAuditTrail, useUsers } from "@/hooks/queries";
import { fieldLabel, formatAuditValue, formatDateTime, initials, parsePageParam } from "@/lib/format";
import { pageSizePreference } from "@/lib/preferences";

const ACTION_LABELS: Record<AuditAction, string> = { CREATE: "Created", UPDATE: "Updated" };

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const action = (searchParams.get("action") ?? "ALL") as AuditAction | "ALL";
  const equipmentId = searchParams.get("equipmentId") ?? "ALL";
  const changedById = searchParams.get("changedById") ?? "ALL";
  const field = searchParams.get("field") ?? "ALL";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const limit = pageSizePreference.get();

  const equipmentOptions = useEquipmentList({ page: 1, limit: 100 });
  const userOptions = useUsers();
  const trail = useGlobalAuditTrail({
    page,
    limit,
    ...(action !== "ALL" ? { action } : {}),
    ...(equipmentId !== "ALL" ? { equipmentId } : {}),
    ...(changedById !== "ALL" ? { changedById } : {}),
    ...(field !== "ALL" ? { field } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
    }
    if (Object.keys(next).some((key) => key !== "page")) params.delete("page");
    setSearchParams(params, { replace: true });
  }

  const fieldOptions = Object.keys(AUDITED_FIELD_LABELS);
  const resolveUser = (id: string) => userOptions.data?.find((u) => u.id === id)?.name;

  const activeFilters = [action, equipmentId, changedById, field].filter((value) => value !== "ALL").length +
    (from || to ? 1 : 0);
  const matchCount = trail.data && isOffsetMeta(trail.data.pagination) ? trail.data.pagination.total : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Audit &amp; Compliance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The complete field-level change history across every cleaning record. Append-only, enforced by a
          database trigger — this list can never be edited or shortened, only added to.
        </p>
      </div>

      <Card className="flex flex-row flex-wrap items-end gap-3 px-4 py-4">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Action</span>
          <Select value={action} onValueChange={(value) => update({ action: value })}>
            <SelectTrigger className="h-9 w-36" aria-label="Filter by action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Equipment</span>
          <Select value={equipmentId} onValueChange={(value) => update({ equipmentId: value })}>
            <SelectTrigger className="h-9 w-48" aria-label="Filter by equipment"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All equipment</SelectItem>
              {equipmentOptions.data?.data.map((equipment) => (
                <SelectItem key={equipment.id} value={equipment.id}>
                  {equipment.code} · {equipment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Changed by</span>
          <Select value={changedById} onValueChange={(value) => update({ changedById: value })}>
            <SelectTrigger className="h-9 w-44" aria-label="Filter by who changed it"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Everyone</SelectItem>
              {userOptions.data?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Field</span>
          <Select value={field} onValueChange={(value) => update({ field: value })}>
            <SelectTrigger className="h-9 w-40" aria-label="Filter by field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any field</SelectItem>
              {fieldOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {AUDITED_FIELD_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Date range</span>
          <DateRangeFilter from={from} to={to} onChange={(next) => update(next)} />
        </div>

        {activeFilters > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
          >
            <X />
            Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
          </Button>
        ) : null}

        <p className="ml-auto text-sm text-muted-foreground tabular-nums">
          {matchCount === undefined ? null : (
            <>
              <span className="font-semibold text-foreground">{matchCount}</span>{" "}
              {matchCount === 1 ? "entry" : "entries"}
            </>
          )}
        </p>
      </Card>

      <Card>
        {trail.isPending ? (
          <TableSkeleton rows={8} columns={4} />
        ) : trail.isError ? (
          <ErrorState message={(trail.error as Error).message} onRetry={() => void trail.refetch()} />
        ) : trail.data.data.length === 0 ? (
          <EmptyState title="No audit entries match these filters" />
        ) : (
          <ul className="divide-y">
            {trail.data.data.map((entry) => (
              <li
                key={entry.id}
                className={`flex gap-3 border-l-2 px-4 py-3.5 transition-colors hover:bg-accent/40 ${
                  entry.action === "CREATE" ? "border-l-brand-600" : "border-l-border"
                }`}
              >
                <Avatar className="mt-0.5 size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{initials(entry.changedBy.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{entry.changedBy.name}</span>{" "}
                      <Badge variant="outline" className="mx-1 align-middle text-[10px]">
                        {ACTION_LABELS[entry.action]}
                      </Badge>{" "}
                      <Link to={`/app/equipment/${entry.equipment.id}`} className="font-medium text-primary hover:underline">
                        {entry.equipment.code}
                      </Link>
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">{formatDateTime(entry.changedAt)}</p>
                  </div>
                  {entry.reason ? (
                    <p className="mt-1 rounded-md bg-pending-50 px-2 py-1 text-xs text-pending-700">
                      Reason: {entry.reason}
                    </p>
                  ) : null}
                  <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    {Object.entries(entry.changes).map(([key, change]) => (
                      <div key={key} className="flex gap-2 text-xs">
                        <dt className="w-24 shrink-0 text-muted-foreground">{fieldLabel(key)}</dt>
                        <dd className="text-foreground">
                          {entry.action === "UPDATE" ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {formatAuditValue(key, change.old, resolveUser)}
                              </span>{" "}
                              →{" "}
                            </>
                          ) : null}
                          <span className="font-medium">{formatAuditValue(key, change.new, resolveUser)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        )}

        {trail.data && isOffsetMeta(trail.data.pagination) ? (
          <OffsetPager meta={trail.data.pagination} onPageChange={(next) => update({ page: String(next) })} />
        ) : null}
      </Card>
    </div>
  );
}
