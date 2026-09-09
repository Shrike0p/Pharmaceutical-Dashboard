import type { OffsetPaginationMeta } from "@ecl/shared";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="text-sm tabular-nums text-muted-foreground">
        {firstOnPage > meta.total ? (
          <>No results on this page — {meta.total} in total</>
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{firstOnPage}</span>–
            <span className="font-medium text-foreground">{lastOnPage}</span> of{" "}
            <span className="font-medium text-foreground">{meta.total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!meta.hasPreviousPage} onClick={() => onPageChange(meta.page - 1)}>
          Previous
        </Button>
        <span className="px-1 text-sm tabular-nums text-muted-foreground">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <Button variant="outline" size="sm" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
