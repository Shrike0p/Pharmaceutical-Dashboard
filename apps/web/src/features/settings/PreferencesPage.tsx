import { useState } from "react";
import { toast } from "sonner";
import { Layers, ListOrdered, Monitor, RotateCcw } from "lucide-react";
import type { PaginationMode } from "@ecl/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGINATION_MODE,
  pageSizePreference,
  paginationModePreference,
} from "@/lib/preferences";

const PAGE_SIZES = [10, 20, 50] as const;

const MODES: Array<{ value: PaginationMode; label: string; blurb: string }> = [
  {
    value: "offset",
    label: "Offset",
    blurb: "Numbered pages and a total count. Can repeat or skip a row if one is inserted while you page.",
  },
  {
    value: "cursor",
    label: "Keyset",
    blurb: "Anchors on the last row's value, so concurrent inserts cannot shift the window. No total.",
  },
];

/**
 * A labelled row with its control on the right. Extracted because both
 * settings share the shape and the second one was already drifting from the
 * first before this page was rebuilt.
 */
function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Layers;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="font-heading text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pt-1">{children}</div>
    </div>
  );
}

export function PreferencesPage() {
  const [pageSize, setPageSize] = useState(pageSizePreference.get);
  const [paginationMode, setPaginationMode] = useState<PaginationMode>(paginationModePreference.get);

  const isDefault = pageSize === DEFAULT_PAGE_SIZE && paginationMode === DEFAULT_PAGINATION_MODE;

  function updatePageSize(size: number) {
    setPageSize(size);
    pageSizePreference.set(size);
  }

  function updateMode(mode: PaginationMode) {
    setPaginationMode(mode);
    paginationModePreference.set(mode);
  }

  function resetToDefaults() {
    updatePageSize(DEFAULT_PAGE_SIZE);
    updateMode(DEFAULT_PAGINATION_MODE);
    toast.success("Preferences reset to defaults");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Preferences</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            How the record and audit tables behave for you.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetToDefaults}
          disabled={isDefault}
          title={isDefault ? "Already at the defaults" : undefined}
        >
          <RotateCcw />
          Reset to defaults
        </Button>
      </div>

      <Card className="mt-4 flex-row items-start gap-3 bg-muted/40 px-4 py-3.5 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Stored in this browser only. These are a reading preference, not account settings — they do
          not sync to your other devices, and they change nothing about what is recorded.
        </p>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Records &amp; audit tables</CardTitle>
          <CardDescription>
            Applied the next time you open the Cleaning Records, Audit, Equipment or Users pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <SettingRow
            icon={ListOrdered}
            title="Rows per page"
            description="How many rows each page of a table loads at once."
          >
            {/* A segmented control rather than a Select: three fixed options
                are quicker to compare side by side than behind a popover. */}
            <div
              role="radiogroup"
              aria-label="Rows per page"
              className="inline-flex rounded-full bg-muted p-1"
            >
              {PAGE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={pageSize === size}
                  onClick={() => updatePageSize(size)}
                  className={`min-w-12 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${
                    pageSize === size
                      ? "bg-card text-foreground shadow-(--shadow-xs)"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            icon={Layers}
            title="Default pagination"
            description="Which paging strategy the cleaning-record lists use. Both are implemented server-side; this picks the one you read with."
          >
            <div className="grid gap-2 sm:w-72">
              {MODES.map((mode) => {
                const selected = paginationMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => updateMode(mode.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-brand-600/40 bg-brand-50"
                        : "hover:border-brand-300 hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`size-3.5 rounded-full border-2 transition-colors ${
                          selected ? "border-brand-700 bg-brand-700" : "border-border"
                        }`}
                      />
                      <span className="text-sm font-semibold text-foreground">{mode.label}</span>
                      {mode.value === DEFAULT_PAGINATION_MODE ? (
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          Default
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{mode.blurb}</span>
                  </button>
                );
              })}
            </div>
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
}
