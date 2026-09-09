import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useEquipmentList } from "@/hooks/queries";
import { useIsSupervisor } from "@/lib/auth";

const DESTINATIONS = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/equipment", label: "Equipment", icon: Wrench },
  { to: "/app/records", label: "Cleaning Records", icon: ClipboardList },
  { to: "/app/audit", label: "Audit & Compliance", icon: ShieldCheck },
  { to: "/app/settings/profile", label: "Profile settings", icon: UserRound },
  { to: "/app/settings/preferences", label: "Preferences", icon: SlidersHorizontal },
];

/**
 * Cmd/Ctrl+K jump-to. The equipment search reuses the same endpoint and
 * `search` param the Equipment list page already uses — this is a second
 * entry point onto the same data, not a new capability to maintain.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const isSupervisor = useIsSupervisor();
  const [search, setSearch] = useState("");

  // Reset the query each time the palette is dismissed, so reopening it with
  // ⌘K never shows a stale search from last time.
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const equipmentQuery = useEquipmentList({ page: 1, limit: 6, search: search || undefined });

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Search or navigate">
      {/* CommandDialog does not wrap its children in the cmdk Command context
          provider itself, so CommandInput/CommandList/CommandItem would
          otherwise read from a context that was never mounted.
          `shouldFilter={false}`: the "Pages" group is a short static list
          (always worth showing in full) and the "Equipment" group is already
          filtered server-side by `search` — cmdk's own client-side filter
          would fight the server-driven one rather than help it. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search equipment, or jump to a page…"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Pages">
            {DESTINATIONS.map((destination) => (
              <CommandItem key={destination.to} value={destination.label} onSelect={() => go(destination.to)}>
                <destination.icon />
                {destination.label}
              </CommandItem>
            ))}
            {isSupervisor ? (
              <CommandItem value="Users settings" onSelect={() => go("/app/settings/users")}>
                <Users />
                Users settings
              </CommandItem>
            ) : null}
          </CommandGroup>
          {equipmentQuery.data && equipmentQuery.data.data.length > 0 ? (
            <CommandGroup heading="Equipment">
              {equipmentQuery.data.data.map((equipment) => (
                <CommandItem
                  key={equipment.id}
                  value={`${equipment.name} ${equipment.code}`}
                  onSelect={() => go(`/app/equipment/${equipment.id}`)}
                >
                  <Wrench />
                  <span>{equipment.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{equipment.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
