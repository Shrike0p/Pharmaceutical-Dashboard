import { Link, useSearchParams } from "react-router-dom";
import {
  CLEANING_METHODS,
  CLEANING_METHOD_LABELS,
  type CleaningMethod,
  type PaginationMode,
  type RecordStatus,
} from "@ecl/shared";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { RecordStatusBadge } from "@/components/status-badges";
import { PersonCell } from "@/components/person-cell";
import { OffsetPager } from "@/components/OffsetPager";
import { useEquipmentList, useGlobalCleaningRecords } from "@/hooks/queries";
import { formatDateTime, parsePageParam } from "@/lib/format";
import { pageSizePreference } from "@/lib/preferences";

const STATUS_FILTERS = [
  { label: "All statuses", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Verified", value: "VERIFIED" },
] as const;

export function RecordsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const status = (searchParams.get("status") ?? "ALL") as RecordStatus | "ALL";
  const method = (searchParams.get("method") ?? "ALL") as CleaningMethod | "ALL";
  const equipmentId = searchParams.get("equipmentId") ?? "ALL";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const mode: PaginationMode = "offset";
  const limit = pageSizePreference.get();

  const equipmentOptions = useEquipmentList({ page: 1, limit: 100 });
  const records = useGlobalCleaningRecords({
    mode,
    page,
    limit,
    ...(status !== "ALL" ? { status } : {}),
    ...(method !== "ALL" ? { method } : {}),
    ...(equipmentId !== "ALL" ? { equipmentId } : {}),
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

  const pagination = records.data?.pagination;

  const activeFilters = [status, method, equipmentId].filter((value) => value !== "ALL").length +
    (from || to ? 1 : 0);
  const matchCount = pagination && pagination.mode === "offset" ? pagination.total : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Cleaning Records</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every cleaning across every asset. Filter to find a specific record, then open its equipment to
          verify or review its history.
        </p>
      </div>

      <Card className="flex flex-row flex-wrap items-end gap-3 px-4 py-4">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={status} onValueChange={(value) => update({ status: value })}>
            <SelectTrigger className="h-9 w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
          <span className="text-xs text-muted-foreground">Method</span>
          <Select value={method} onValueChange={(value) => update({ method: value })}>
            <SelectTrigger className="h-9 w-36" aria-label="Filter by method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All methods</SelectItem>
              {CLEANING_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {CLEANING_METHOD_LABELS[m]}
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
              {matchCount === 1 ? "record" : "records"}
            </>
          )}
        </p>
      </Card>

      <Card>
        {records.isPending ? (
          <TableSkeleton rows={8} columns={5} />
        ) : records.isError ? (
          <ErrorState message={(records.error as Error).message} onRetry={() => void records.refetch()} />
        ) : records.data.data.length === 0 ? (
          <EmptyState title="No records match these filters" description="Try widening the date range or clearing a filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3 font-medium">Cleaned at</th>
                  <th scope="col" className="px-4 py-3 font-medium">Equipment</th>
                  <th scope="col" className="px-4 py-3 font-medium">Cleaned by</th>
                  <th scope="col" className="px-4 py-3 font-medium">Method</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.data.data.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-accent/60">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                      {formatDateTime(record.cleanedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/equipment/${record.equipment.id}`} className="text-primary hover:underline">
                        {record.equipment.code}
                      </Link>
                      <span className="ml-1.5 text-muted-foreground">{record.equipment.name}</span>
                    </td>
                    <td className="px-4 py-3"><PersonCell name={record.cleanedBy.name} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{CLEANING_METHOD_LABELS[record.method]}</td>
                    <td className="px-4 py-3">
                      <RecordStatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination?.mode === "offset" ? (
          <OffsetPager meta={pagination} onPageChange={(next) => update({ page: String(next) })} />
        ) : null}
      </Card>
    </div>
  );
}
