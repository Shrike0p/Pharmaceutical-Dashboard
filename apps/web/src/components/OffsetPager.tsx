import type { OffsetPaginationMeta } from "@ecl/shared";
import { Button } from "./ui";

/**
 * Numbered paging controls. These need a total page count, which is precisely
 * what keyset pagination cannot supply without a separate COUNT — the reason
 * offset remains the default mode for the UI.
 */
export function OffsetPager({
  meta,
  onPageChange,
}: {
  meta: OffsetPaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (meta.total === 0) return null;

  const firstOnPage = (meta.page - 1) * meta.limit + 1;
  const lastOnPage = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      <p className="tnum text-sm text-slate-500">
        {firstOnPage > meta.total ? (
          <>No results on this page — {meta.total} in total</>
        ) : (
          <>
            Showing <span className="font-medium text-slate-700">{firstOnPage}</span>–
            <span className="font-medium text-slate-700">{lastOnPage}</span> of{" "}
            <span className="font-medium text-slate-700">{meta.total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={!meta.hasPreviousPage}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </Button>
        <span className="tnum px-1 text-sm text-slate-600">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <Button variant="secondary" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
