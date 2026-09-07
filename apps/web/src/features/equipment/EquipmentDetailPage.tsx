import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CLEANING_METHOD_LABELS, type CleaningRecordDto, type PaginationMode, type RecordStatus } from "@ecl/shared";
import {
  Button,
  Card,
  EmptyState,
  EquipmentStatusBadge,
  ErrorState,
  RecordStatusBadge,
  TableSkeleton,
} from "../../components/ui";
import { OffsetPager } from "../../components/OffsetPager";
import { useCleaningRecords, useEquipment } from "../../hooks/queries";
import { formatDateTime } from "../../lib/format";
import { CleaningRecordDialog } from "../cleaning-records/CleaningRecordDialog";
import { AuditTrailPanel } from "../audit/AuditTrailPanel";

const PAGE_SIZE = 10;
const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Verified", value: "VERIFIED" },
] as const;

export function EquipmentDetailPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") ?? "") as RecordStatus | "";
  const mode = (searchParams.get("mode") ?? "offset") as PaginationMode;
  const cursor = searchParams.get("cursor") ?? undefined;

  const [editing, setEditing] = useState<CleaningRecordDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [auditFor, setAuditFor] = useState<CleaningRecordDto | null>(null);
  // Keyset pages are a trail forward, so going "back" means popping a stack.
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const equipment = useEquipment(equipmentId);
  const records = useCleaningRecords(equipmentId, {
    mode,
    page,
    limit: PAGE_SIZE,
    ...(status ? { status } : {}),
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
    update({ status: value || undefined, page: undefined, cursor: undefined });
  }

  function setMode(value: PaginationMode) {
    setCursorHistory([]);
    update({ mode: value === "offset" ? undefined : value, page: undefined, cursor: undefined });
  }

  const pagination = records.data?.pagination;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/" className="text-sm text-brand-700 hover:underline">
        ← All equipment
      </Link>

      {equipment.isPending ? (
        <div className="mt-3 h-9 w-64 animate-pulse rounded bg-slate-200" />
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
                <h1 className="text-lg font-semibold text-slate-900">{equipment.data.name}</h1>
                <EquipmentStatusBadge status={equipment.data.status} />
              </div>
              <p className="tnum mt-0.5 text-sm text-slate-500">
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
              Record a cleaning
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={status === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={
                    status === filter.value
                      ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm"
                      : "rounded-md px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                  }
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Exposed in the UI so the keyset implementation is demonstrable,
                not just present in the API. */}
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Pagination
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as PaginationMode)}
                className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-300 ring-inset"
              >
                <option value="offset">Offset (page numbers)</option>
                <option value="cursor">Keyset (cursor)</option>
              </select>
            </label>
          </div>

          <Card>
            {records.isPending ? (
              <TableSkeleton rows={6} columns={5} />
            ) : records.isError ? (
              <ErrorState message={(records.error as Error).message} onRetry={() => void records.refetch()} />
            ) : records.data.data.length === 0 ? (
              <EmptyState
                title={status ? `No ${status.toLowerCase()} records` : "No cleaning records yet"}
                description={
                  status
                    ? "Try clearing the filter to see all records."
                    : "Record the first cleaning for this equipment."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
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
                  <tbody className="divide-y divide-slate-100">
                    {records.data.data.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="tnum px-4 py-3 whitespace-nowrap text-slate-700">
                          {formatDateTime(record.cleanedAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{record.cleanedBy.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {CLEANING_METHOD_LABELS[record.method]}
                        </td>
                        <td className="px-4 py-3">
                          <RecordStatusBadge status={record.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" onClick={() => setAuditFor(record)}>
                              History
                            </Button>
                            <Button variant="secondary" onClick={() => setEditing(record)}>
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
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Keyset pagination — stable under concurrent inserts, but no total page count.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
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
                    variant="secondary"
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
