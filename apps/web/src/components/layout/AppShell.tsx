import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
  const [sidebarOpen, setSidebarOpen] = useState(sidebarPreference.get);
  const [commandOpen, setCommandOpen] = useState(false);

  function updateSidebarOpen(open: boolean) {
    setSidebarOpen(open);
    sidebarPreference.set(open);
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
    <SidebarProvider open={sidebarOpen} onOpenChange={updateSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader title={pageTitle(location.pathname)} onOpenCommandPalette={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  );
}
