import { useState } from "react";
import type { PaginationMode } from "@ecl/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pageSizePreference, paginationModePreference } from "@/lib/preferences";

const PAGE_SIZES = [10, 20, 50] as const;

export function PreferencesPage() {
  const [pageSize, setPageSize] = useState(pageSizePreference.get);
  const [paginationMode, setPaginationMode] = useState<PaginationMode>(paginationModePreference.get);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Preferences</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Stored on this device only — these do not sync between browsers or computers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Records &amp; audit tables</CardTitle>
          <CardDescription>Applied the next time you open the Cleaning Records or Audit pages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Rows per page</p>
              <p className="text-xs text-muted-foreground">How many records load at once.</p>
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const size = Number(value);
                setPageSize(size);
                pageSizePreference.set(size);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Default pagination</p>
              <p className="text-xs text-muted-foreground">
                Offset shows page numbers and a total count. Keyset stays correct under
                concurrent inserts, at the cost of not knowing the total.
              </p>
            </div>
            <Select
              value={paginationMode}
              onValueChange={(value) => {
                const mode = value as PaginationMode;
                setPaginationMode(mode);
                paginationModePreference.set(mode);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offset">Offset</SelectItem>
                <SelectItem value="cursor">Keyset</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
