import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "cn";
import { ROLE_LABELS } from "@ecl/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark } from "@/components/BrandMark";
import { initials } from "@/lib/format";
import { useAuth, useIsSupervisor } from "@/lib/auth";

/**
 * A hover-expanding sidebar, on the pattern Aceternity's sidebar popularised:
 * an icon rail that widens on pointer-enter while the labels fade in beside
 * their icons, rather than a rail that swaps to tooltips.
 *
 * Two departures from that reference, both on purpose:
 *
 * 1. **It can be pinned.** Hover-only expansion is a demo affordance — it means
 *    the labels are never on screen while you are actually reading the page. The
 *    pin state persists, and hover only expands while unpinned.
 * 2. **The active item is one shared `layoutId`**, so the indicator glides
 *    between entries on navigation instead of cross-fading. This was listed in
 *    NOTES.md as skipped-for-time: it was expensive to do on top of shadcn's
 *    `SidebarMenuButton`, whose own `data-active` background had to be fought
 *    rather than composed with. Owning the markup makes it three lines.
 */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Matched by prefix, so a detail route (e.g. /app/equipment/:id) still
   *  highlights its parent's entry. */
  matchPrefix?: string;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/equipment", label: "Equipment", icon: Wrench, matchPrefix: "/app/equipment" },
  { to: "/app/records", label: "Cleaning Records", icon: ClipboardList },
  { to: "/app/audit", label: "Audit & Compliance", icon: ShieldCheck },
];

const EXPANDED_WIDTH = 264;
const RAIL_WIDTH = 76;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Labels stay mounted and are clipped by the rail's `overflow-hidden` rather
 * than being unmounted — animating `display` or remounting text mid-transition
 * is what makes this kind of sidebar look like it stutters.
 */
function Label({ expanded, className, children }: { expanded: boolean; className?: string; children: React.ReactNode }) {
  return (
    <motion.span
      animate={{ opacity: expanded ? 1 : 0 }}
      transition={{ duration: expanded ? 0.2 : 0.12, delay: expanded ? 0.06 : 0 }}
      aria-hidden={!expanded}
      className={cn("whitespace-nowrap", className)}
    >
      {children}
    </motion.span>
  );
}

function NavList({
  expanded,
  layoutIdPrefix,
  onNavigate,
}: {
  expanded: boolean;
  layoutIdPrefix: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const isSupervisor = useIsSupervisor();

  const sections: Array<{ label: string; items: NavItem[] }> = [
    { label: "Workspace", items: WORKSPACE_ITEMS },
    {
      label: "Settings",
      items: [
        { to: "/app/settings/profile", label: "Profile", icon: UserRound },
        ...(isSupervisor ? [{ to: "/app/settings/users", label: "Users", icon: Users }] : []),
        { to: "/app/settings/preferences", label: "Preferences", icon: SlidersHorizontal },
      ],
    },
  ];

  // Prefix matching is opt-in. Defaulting it to `item.to` looks harmless but
  // permanently lights up Overview: its `to` is "/app", and every route in the
  // app starts with "/app/", so it matched alongside whichever item was really
  // active.
  const isActive = (item: NavItem) =>
    location.pathname === item.to ||
    (item.matchPrefix !== undefined && location.pathname.startsWith(`${item.matchPrefix}/`));

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <Label
            expanded={expanded}
            className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-white/35 uppercase"
          >
            {section.label}
          </Label>

          {section.items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={expanded ? undefined : item.label}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-white/40",
                  active ? "text-white" : "text-white/55 hover:text-white",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={`${layoutIdPrefix}-nav-active`}
                    transition={{ duration: 0.28, ease: EASE }}
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/10"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-white/0 transition-colors hover:bg-white/5"
                  />
                )}
                <item.icon className="relative size-5 shrink-0" />
                <Label expanded={expanded} className="relative text-sm font-medium">
                  {item.label}
                </Label>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ expanded }: { expanded: boolean }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Avatar className="size-8 shrink-0 ring-1 ring-white/20">
            <AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <Label expanded={expanded} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs text-white/45">{ROLE_LABELS[user.role]}</span>
          </Label>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem onClick={() => navigate("/app/settings/profile")}>
          <UserRound />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrandRow({ expanded }: { expanded: boolean }) {
  return (
    <Link to="/app" className="flex items-center gap-3 rounded-xl px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/40">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <BrandMark className="size-5" />
      </span>

      <Label expanded={expanded} className="min-w-0 flex-1">
        <span className="block truncate font-heading text-sm font-semibold text-white">
          Equipment Cleaning Log
        </span>
        <span className="block truncate text-xs text-white/45">GxP audit trail</span>
      </Label>
    </Link>
  );
}

export function AppSidebar({
  pinned,
  mobileOpen,
  onMobileOpenChange,
}: {
  pinned: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (next: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { user } = useAuth();
  const expanded = pinned || hovered;

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onMobileOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onMobileOpenChange]);

  if (!user) return null;

  return (
    <>
      <motion.aside
        animate={{ width: expanded ? EXPANDED_WIDTH : RAIL_WIDTH }}
        transition={{ duration: 0.28, ease: EASE }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="hidden shrink-0 flex-col gap-7 overflow-hidden px-3 py-4 md:flex"
      >
        <BrandRow expanded={expanded} />
        <NavList expanded={expanded} layoutIdPrefix="desktop" />
        <div className="mt-auto">
          <UserFooter expanded={expanded} />
        </div>
      </motion.aside>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => onMobileOpenChange(false)}
              className="absolute inset-0 bg-black/60"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: EASE }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 flex w-72 flex-col gap-7 bg-shell-950 px-3 py-4"
            >
              <div className="flex items-center justify-between">
                <BrandRow expanded />
                <button
                  type="button"
                  onClick={() => onMobileOpenChange(false)}
                  aria-label="Close navigation"
                  className="mr-1 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <NavList expanded layoutIdPrefix="mobile" onNavigate={() => onMobileOpenChange(false)} />
              <div className="mt-auto">
                <UserFooter expanded />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
