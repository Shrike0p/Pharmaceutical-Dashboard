import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { CLEANING_METHOD_LABELS, type CleaningRecordDto, type PaginationMode, type RecordStatus } from "@ecl/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { EquipmentStatusBadge, RecordStatusBadge } from "@/components/status-badges";
import { OffsetPager } from "@/components/OffsetPager";
import { useCleaningRecords, useEquipment } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { pageSizePreference, paginationModePreference } from "@/lib/preferences";
import { CleaningRecordDialog } from "../cleaning-records/CleaningRecordDialog";
import { AuditTrailPanel } from "../audit/AuditTrailPanel";

const STATUS_FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Verified", value: "VERIFIED" },
] as const;

export function EquipmentDetailPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") ?? "ALL") as RecordStatus | "ALL";
  const mode = (searchParams.get("mode") ?? paginationModePreference.get()) as PaginationMode;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = pageSizePreference.get();

  const [editing, setEditing] = useState<CleaningRecordDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [auditFor, setAuditFor] = useState<CleaningRecordDto | null>(null);
  // Keyset pages are a trail forward, so going "back" means popping a stack.
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const equipment = useEquipment(equipmentId);
  const records = useCleaningRecords(equipmentId, {
    mode,
    page,
    limit,
    ...(status !== "ALL" ? { status } : {}),
    ...(cursor ? { cursor } : {}),
  });

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  }

  function setStatusFilter(value: string) {
    setCursorHistory([]);
    update({ status: value === "ALL" ? undefined : value, page: undefined, cursor: undefined });
  }

  function setMode(value: PaginationMode) {
    setCursorHistory([]);
    update({ mode: value, page: undefined, cursor: undefined });
  }

  const pagination = records.data?.pagination;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/app/equipment" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="size-3.5" />
        All equipment
      </Link>

      {equipment.isPending ? (
        <Skeleton className="mt-3 h-9 w-64" />
      ) : equipment.isError ? (
        <Card className="mt-4">
          <ErrorState
            message={(equipment.error as Error).message}
            onRetry={() => void equipment.refetch()}
          />
        </Card>
      ) : (
        <>
          <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-foreground">{equipment.data.name}</h1>
                <EquipmentStatusBadge status={equipment.data.status} />
              </div>
              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                {equipment.data.code} · {equipment.data.cleaningRecordCount} cleaning records
              </p>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              disabled={equipment.data.status === "RETIRED"}
              title={
                equipment.data.status === "RETIRED"
                  ? "Retired equipment cannot accept new cleaning records"
                  : undefined
              }
            >
              <Plus />
              Record a cleaning
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={status} onValueChange={setStatusFilter}>
              <TabsList>
                {STATUS_FILTERS.map((filter) => (
                  <TabsTrigger key={filter.value} value={filter.value}>
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Exposed in the UI so the keyset implementation is demonstrable,
                not just present in the API. */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Pagination
              <Select value={mode} onValueChange={(value) => setMode(value as PaginationMode)}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offset">Offset (page numbers)</SelectItem>
                  <SelectItem value="cursor">Keyset (cursor)</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <Card>
            {records.isPending ? (
              <TableSkeleton rows={6} columns={5} />
            ) : records.isError ? (
              <ErrorState message={(records.error as Error).message} onRetry={() => void records.refetch()} />
            ) : records.data.data.length === 0 ? (
              <EmptyState
                title={status !== "ALL" ? `No ${status.toLowerCase()} records` : "No cleaning records yet"}
                description={
                  status !== "ALL"
                    ? "Try clearing the filter to see all records."
                    : "Record the first cleaning for this equipment."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th scope="col" className="px-4 py-3 font-medium">
                        Cleaned at
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Cleaned by
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Method
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.data.data.map((record) => (
                      <tr key={record.id} className="hover:bg-accent">
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                          {formatDateTime(record.cleanedAt)}
                        </td>
                        <td className="px-4 py-3 text-foreground">{record.cleanedBy.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {CLEANING_METHOD_LABELS[record.method]}
                        </td>
                        <td className="px-4 py-3">
                          <RecordStatusBadge status={record.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setAuditFor(record)}>
                              History
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditing(record)}>
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pagination?.mode === "offset" ? (
              <OffsetPager meta={pagination} onPageChange={(next) => update({ page: String(next) })} />
            ) : pagination?.mode === "cursor" ? (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Keyset pagination — stable under concurrent inserts, but no total page count.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cursorHistory.length === 0}
                    onClick={() => {
                      const previous = [...cursorHistory];
                      const target = previous.pop();
                      setCursorHistory(previous);
                      update({ cursor: target });
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNextPage}
                    onClick={() => {
                      setCursorHistory((history) => [...history, cursor ?? ""]);
                      update({ cursor: pagination.nextCursor ?? undefined });
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}

      {equipmentId ? (
        <>
          <CleaningRecordDialog
            equipmentId={equipmentId}
            record={editing}
            open={isCreating || editing !== null}
            onClose={() => {
              setIsCreating(false);
              setEditing(null);
            }}
          />
          <AuditTrailPanel
            equipmentId={equipmentId}
            record={auditFor}
            onClose={() => setAuditFor(null)}
          />
        </>
      ) : null}
    </div>
  );
}
