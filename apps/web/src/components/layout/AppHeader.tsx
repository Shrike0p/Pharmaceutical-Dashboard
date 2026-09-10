import { Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function AppHeader({
  title,
  pinned,
  onPinnedChange,
  onOpenCommandPalette,
  onOpenMobileNav,
}: {
  title: string;
  pinned: boolean;
  onPinnedChange: (next: boolean) => void;
  onOpenCommandPalette: () => void;
  onOpenMobileNav: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="-ml-1 md:hidden"
      >
        <Menu />
      </Button>

      {/* The pin lives here rather than in the sidebar itself: it has to stay
          reachable while the rail is collapsed, and inside the rail it stole
          enough width to truncate the wordmark. */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPinnedChange(!pinned)}
        aria-label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
        title={pinned ? "Unpin sidebar" : "Keep sidebar open"}
        className="-ml-1 hidden md:inline-flex"
      >
        {pinned ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>

      <Separator orientation="vertical" className="mr-1 hidden h-4 md:block" />

      {/* Not an <h1>: every page renders its own, and two level-one
          headings per screen is a real screen-reader problem. */}
      <p className="font-heading text-sm font-semibold text-foreground">{title}</p>

      <Button
        variant="outline"
        size="sm"
        onClick={onOpenCommandPalette}
        className="ml-auto gap-2 rounded-full text-muted-foreground"
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
