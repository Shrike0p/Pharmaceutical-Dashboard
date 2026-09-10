import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

/** An avatar-initial circle plus name — the "who" in a table row, styled
 *  identically everywhere a person is named across the app. */
export function PersonCell({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate leading-tight font-medium text-foreground">{name}</p>
        {subtitle ? <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
