import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function AppHeader({
  title,
  onOpenCommandPalette,
}: {
  title: string;
  onOpenCommandPalette: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <h1 className="text-sm font-medium text-foreground">{title}</h1>

      <Button
        variant="outline"
        size="sm"
        onClick={onOpenCommandPalette}
        className="ml-auto gap-2 text-muted-foreground"
      >
        <Search />
        Search
        <kbd className="ml-1 hidden rounded-sm border bg-muted px-1.5 py-px font-mono text-[10px] sm:inline">
          {isMac ? "⌘" : "Ctrl"}K
        </kbd>
      </Button>
    </header>
  );
}
