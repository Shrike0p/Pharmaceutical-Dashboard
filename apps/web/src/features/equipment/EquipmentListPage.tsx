import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  EquipmentStatusBadge,
  ErrorState,
  Input,
  TableSkeleton,
} from "../../components/ui";
import { useEquipmentList } from "../../hooks/queries";
import { formatDate } from "../../lib/format";
import { useIsSupervisor } from "../../lib/auth";
import { NewEquipmentDialog } from "./NewEquipmentDialog";
import { OffsetPager } from "../../components/OffsetPager";

const PAGE_SIZE = 10;

export function EquipmentListPage() {
  // The page and search live in the URL, so a particular view can be linked,
  // bookmarked, and survives a refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const search = searchParams.get("q") ?? "";
  const [isCreating, setIsCreating] = useState(false);
  const isSupervisor = useIsSupervisor();

  const query = useEquipmentList({ page, limit: PAGE_SIZE, search: search || undefined });

  function update(next: { page?: number; q?: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
      // A new search invalidates the current page number.
      params.delete("page");
    }
    if (next.page !== undefined) {
      if (next.page > 1) params.set("page", String(next.page));
      else params.delete("page");
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Equipment</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Select a piece of equipment to review its cleaning history.
          </p>
        </div>
        {isSupervisor ? <Button onClick={() => setIsCreating(true)}>Add equipment</Button> : null}
      </div>

      <div className="mb-4 max-w-xs">
        <Input
          type="search"
          placeholder="Search by name or code…"
          defaultValue={search}
          aria-label="Search equipment"
          onChange={(event) => update({ q: event.target.value.trim() })}
        />
      </div>

      <Card>
        {query.isPending ? (
          <TableSkeleton rows={5} columns={4} />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <EmptyState
            title={search ? `No equipment matches “${search}”` : "No equipment yet"}
            description={
              search ? "Try a different name or asset code." : "Add a piece of equipment to get started."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Equipment
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Cleanings
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Last cleaned
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.data.map((equipment) => (
                  <tr key={equipment.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/equipment/${equipment.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {equipment.name}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-3 text-slate-600">{equipment.code}</td>
                    <td className="px-4 py-3">
                      <EquipmentStatusBadge status={equipment.status} />
                    </td>
                    <td className="tnum px-4 py-3 text-slate-600">{equipment.cleaningRecordCount}</td>
                    <td className="tnum px-4 py-3 text-slate-600">{formatDate(equipment.lastCleanedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {query.data && query.data.pagination.mode === "offset" ? (
          <OffsetPager meta={query.data.pagination} onPageChange={(next) => update({ page: next })} />
        ) : null}
      </Card>

      <NewEquipmentDialog open={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}
