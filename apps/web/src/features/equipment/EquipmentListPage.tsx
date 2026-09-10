import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, ChevronRight, CircleCheckBig, ClipboardList, Plus, Search, Wrench, X } from "lucide-react";
import type { EquipmentStatus } from "@ecl/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { EquipmentStatusBadge } from "@/components/status-badges";
import { useDashboardStats, useEquipmentList } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate, formatRelativeDays, parsePageParam } from "@/lib/format";
import { useIsSupervisor } from "@/lib/auth";
import { pageSizePreference } from "@/lib/preferences";
import { NewEquipmentDialog } from "./NewEquipmentDialog";
import { OffsetPager } from "@/components/OffsetPager";

/**
 * The strip doubles as the page's status filter: the counts come from the
 * server-computed dashboard read model (never derived from the current page,
 * which would silently under-report past the first ten rows), and clicking one
 * scopes the table below it.
 */
function SummaryTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  to,
  selected,
}: {
  label: string;
  value: number | undefined;
  detail: string;
  icon: typeof Wrench;
  tone: string;
  to: string;
  selected: boolean;
}) {
  return (
    <Link to={to} aria-current={selected ? "true" : undefined} className="pop-on-hover block rounded-xl">
      <Card
        size="sm"
        className={`h-full ${selected ? "bg-brand-50 ring-brand-600/50" : ""}`}
      >
        <CardContent className="flex items-center gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            {value === undefined ? (
              <Skeleton className="mt-1 h-6 w-10" />
            ) : (
              <p className="font-heading text-xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">{detail}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function EquipmentListPage() {
  // The page, search and status filter all live in the URL, so a particular
  // view can be linked, bookmarked, and survives a refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const search = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status: EquipmentStatus | undefined =
    statusParam === "ACTIVE" || statusParam === "RETIRED" ? statusParam : undefined;

  const [isCreating, setIsCreating] = useState(false);
  const isSupervisor = useIsSupervisor();

  /**
   * The box is driven by local state and the *debounced* value is what reaches
   * the query and the URL — typing "Mixing Tank" used to fire eleven requests,
   * ten of which were thrown away.
   *
   * Local state is deliberately the only writer, seeded from the URL once on
   * mount. Syncing the URL back into it would race the debounce: a keystroke
   * landing between the URL write and the sync effect gets overwritten by the
   * older value, silently eating characters.
   */
  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const query = useEquipmentList({
    page,
    limit: pageSizePreference.get(),
    search: debouncedSearch || undefined,
    status,
  });
  const stats = useDashboardStats();
  const isFiltered = Boolean(debouncedSearch || status);

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

  // Mirrors the settled search term into the URL so the view stays linkable.
  // Skipped on mount, where it would only rewrite the value it just read.
  const mirroredSearch = useRef(search);
  useEffect(() => {
    // Deliberately keyed on the debounced term alone. `update` closes over the
    // current params and is a new function every render, so depending on it
    // would re-run this on every render; the ref is what keeps the guard
    // stable across those renders.
    if (mirroredSearch.current === debouncedSearch) return;
    mirroredSearch.current = debouncedSearch;
    update({ q: debouncedSearch });
  }, [debouncedSearch]);

  function clearFilters() {
    setSearchInput("");
    mirroredSearch.current = "";
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  /** Preserves the search term when switching status, and resets paging. */
  function statusHref(next: EquipmentStatus | undefined): string {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (next) params.set("status", next);
    const queryString = params.toString();
    return `/app/equipment${queryString ? `?${queryString}` : ""}`;
  }

  const rows = query.data?.data ?? [];
  // The volume bar is explicitly relative to what is on screen, which is why
  // the count sits beside it as the real value.
  const maxCleanings = Math.max(...rows.map((row) => row.cleaningRecordCount), 1);
  // `total` only exists on the offset branch of the pagination union; this
  // endpoint is offset-only, but the type has to be narrowed to say so.
  const matchCount =
    query.data?.pagination.mode === "offset" ? query.data.pagination.total : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Equipment</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every asset cleaning records are filed against. Open one to review or verify its history.
          </p>
        </div>
        {isSupervisor ? (
          <Button onClick={() => setIsCreating(true)} className="h-10 rounded-full px-5">
            <Plus />
            Add equipment
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Total assets"
          value={stats.data?.equipment.total}
          detail="All"
          icon={Wrench}
          tone="bg-brand-700 text-white"
          to={statusHref(undefined)}
          selected={status === undefined}
        />
        <SummaryTile
          label="Active"
          value={stats.data?.equipment.active}
          detail="In service"
          icon={CircleCheckBig}
          tone="bg-verify-50 text-verify-700"
          to={statusHref("ACTIVE")}
          selected={status === "ACTIVE"}
        />
        <SummaryTile
          label="Retired"
          value={stats.data?.equipment.retired}
          detail="History kept"
          icon={Archive}
          tone="bg-muted text-muted-foreground"
          to={statusHref("RETIRED")}
          selected={status === "RETIRED"}
        />
        <SummaryTile
          label="Cleaning records"
          value={stats.data?.records.total}
          detail="All assets"
          icon={ClipboardList}
          tone="bg-pending-50 text-pending-700"
          to="/app/records"
          selected={false}
        />
      </div>

      {/* Card ships `flex flex-col`, so a filter bar needs an explicit
          flex-row — adding flex-wrap alone leaves the column direction intact
          and stacks the controls vertically. */}
      <Card className="mt-4 flex-row flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name or code…"
            value={searchInput}
            aria-label="Search equipment"
            className="h-10 pl-9"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        {isFiltered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear filters
          </Button>
        ) : null}

        <p className="ml-auto text-sm text-muted-foreground tabular-nums">
          {matchCount === undefined ? null : (
            <>
              <span className="font-semibold text-foreground">{matchCount}</span>{" "}
              {matchCount === 1 ? "asset" : "assets"}
              {status ? ` · ${status === "ACTIVE" ? "active" : "retired"}` : ""}
            </>
          )}
        </p>
      </Card>

      <Card className="mt-4 overflow-hidden py-0">
        {query.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              search
                ? `No equipment matches "${search}"`
                : status
                  ? `No ${status === "ACTIVE" ? "active" : "retired"} equipment`
                  : "No equipment yet"
            }
            description={
              isFiltered
                ? "Try a different name, asset code, or status."
                : "Add a piece of equipment to start filing cleaning records against it."
            }
            action={
              isFiltered ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : isSupervisor ? (
                <Button onClick={() => setIsCreating(true)}>
                  <Plus />
                  Add equipment
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3">
                    Asset
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Cleanings
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Last cleaned
                  </th>
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((equipment) => {
                  const relative = formatRelativeDays(equipment.lastCleanedAt);
                  return (
                    <tr key={equipment.id} className="group relative transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* The asset-code prefix as a monogram — the plant
                              floor identifies equipment by code, not name. */}
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-[11px] font-bold text-brand-700">
                            {equipment.code.split("-")[0]?.slice(0, 3)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to={`/app/equipment/${equipment.id}`}
                              // Stretches the link over the whole row, so the
                              // row is clickable while staying one link.
                              className="block truncate font-semibold text-foreground after:absolute after:inset-0 group-hover:text-brand-700"
                            >
                              {equipment.name}
                            </Link>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {equipment.code}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <EquipmentStatusBadge status={equipment.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 text-right font-semibold tabular-nums text-foreground">
                            {equipment.cleaningRecordCount}
                          </span>
                          <span
                            aria-hidden
                            className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"
                          >
                            <span
                              className="block h-full rounded-full bg-brand-600"
                              style={{
                                width: `${Math.max((equipment.cleaningRecordCount / maxCleanings) * 100, equipment.cleaningRecordCount > 0 ? 6 : 0)}%`,
                              }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block tabular-nums text-foreground">
                          {formatDate(equipment.lastCleanedAt)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {relative ?? "Never cleaned"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
                      </td>
                    </tr>
                  );
                })}
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
