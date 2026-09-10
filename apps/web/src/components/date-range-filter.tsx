import { CalendarDays, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * The `from`/`to` filter on the records and audit pages.
 *
 * Replaces two `<input type="date">` boxes, which pushed a request on every
 * keystroke of a half-typed year ("0002-01-01" is a valid date to the browser)
 * and rendered as three different controls across Chrome, Safari and Firefox.
 *
 * ## Why the date maths is hand-rolled
 *
 * The API speaks `YYYY-MM-DD`. The obvious conversions are both wrong:
 *
 * - `new Date("2026-09-08")` parses as **UTC** midnight, so anywhere west of
 *   Greenwich it renders as the 7th — the calendar highlights the day before
 *   the one in the URL.
 * - `date.toISOString().slice(0, 10)` re-serialises in UTC, so picking the 8th
 *   in a negative-offset timezone writes `2026-09-07`.
 *
 * A calendar day is a wall-clock date, not an instant, so both directions use
 * the local Y/M/D components and never cross a timezone.
 */

function parseLocalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const shortDayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function label(from: Date | undefined, to: Date | undefined): string {
  if (!from && !to) return "Any date";
  if (from && to) {
    // Same year reads better without repeating it: "8 – 14 Sep 2026".
    return from.getFullYear() === to.getFullYear()
      ? `${shortDayMonth.format(from)} – ${shortDate.format(to)}`
      : `${shortDate.format(from)} – ${shortDate.format(to)}`;
  }
  if (from) return `From ${shortDate.format(from)}`;
  return `Until ${shortDate.format(to)}`;
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  /** Both keys are always sent, so clearing one end cannot leave a stale bound. */
  onChange: (next: { from: string | undefined; to: string | undefined }) => void;
}) {
  const isMobile = useIsMobile();
  const selected: DateRange | undefined = parseLocalDate(from)
    ? { from: parseLocalDate(from), to: parseLocalDate(to) }
    : parseLocalDate(to)
      ? { from: parseLocalDate(to), to: parseLocalDate(to) }
      : undefined;

  const hasRange = Boolean(from || to);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-10 justify-start gap-2 font-normal ${hasRange ? "text-foreground" : "text-muted-foreground"}`}
        >
          <CalendarDays className="size-4 shrink-0" />
          {label(parseLocalDate(from), parseLocalDate(to))}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={isMobile ? 1 : 2}
          defaultMonth={parseLocalDate(from) ?? parseLocalDate(to)}
          selected={selected}
          onSelect={(range) => onChange({ from: toIsoDate(range?.from), to: toIsoDate(range?.to) })}
          autoFocus
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {hasRange ? "Both ends are inclusive." : "Pick a start, then an end."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasRange}
            onClick={() => onChange({ from: undefined, to: undefined })}
          >
            <X />
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
