import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CommandPalette } from "./CommandPalette";
import { sidebarPreference } from "@/lib/preferences";

/**
 * Ordered by specificity so a longer, more specific prefix is checked first —
 * `/app/settings/users` must not match the generic `/app/settings` fallback
 * before its own entry gets a chance.
 */
const PAGE_TITLES: Array<[prefix: string, title: string]> = [
  ["/app/settings/users", "Users"],
  ["/app/settings/preferences", "Preferences"],
  ["/app/settings/profile", "Profile"],
  ["/app/equipment", "Equipment"],
  ["/app/records", "Cleaning Records"],
  ["/app/audit", "Audit & Compliance"],
  ["/app", "Overview"],
];

function pageTitle(pathname: string): string {
  return PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "";
}

export function AppShell() {
  const location = useLocation();
  const [pinned, setPinned] = useState(sidebarPreference.get);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const scrollerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  function updatePinned(next: boolean) {
    setPinned(next);
    sidebarPreference.set(next);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // The dark ground is the frame: the sidebar sits directly on it and the
    // content is an inset rounded panel, which is what gives the app its
    // "sheet on a desk" depth instead of two flat columns meeting at a border.
    <div className="flex h-dvh w-full overflow-hidden bg-shell-950 md:gap-1 md:p-2.5">
      <AppSidebar pinned={pinned} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-3xl md:ring-1 md:ring-white/10">
        <AppHeader
          title={pageTitle(location.pathname)}
          pinned={pinned}
          onPinnedChange={updatePinned}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        {/* The panel scrolls, not the page — so the sidebar and the rounded
            corners stay put while the content moves. The trade-off is that the
            browser's own scroll restoration no longer applies (it only tracks
            the document scroller), so without the reset below you arrive on a
            new route already scrolled to wherever you left the last one. */}
        <main ref={scrollerRef} className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
