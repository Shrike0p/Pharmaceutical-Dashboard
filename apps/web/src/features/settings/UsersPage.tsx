import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EllipsisVertical, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { isOffsetMeta, ROLES, ROLE_LABELS, type Role, type UserAdminDto } from "@ecl/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { OffsetPager } from "@/components/OffsetPager";
import { PersonCell } from "@/components/person-cell";
import { useAuth } from "@/lib/auth";
import { useUpdateUserAdmin, useUsersAdmin } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";
import { formatDate, parsePageParam } from "@/lib/format";
import { pageSizePreference } from "@/lib/preferences";
import { NewUserDialog } from "./NewUserDialog";

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const role = (searchParams.get("role") ?? "ALL") as Role | "ALL";
  const activeFilter = searchParams.get("active") ?? "ALL";
  const [isCreating, setIsCreating] = useState(false);

  const users = useUsersAdmin({
    page,
    limit: pageSizePreference.get(),
    ...(role !== "ALL" ? { role } : {}),
    ...(activeFilter !== "ALL" ? { isActive: activeFilter === "true" } : {}),
  });
  const updateUser = useUpdateUserAdmin();

  /** Deactivation is destructive enough to confirm; the row is held here. */
  const [pendingDeactivation, setPendingDeactivation] = useState<UserAdminDto | null>(null);

  function changeRole(userId: string, name: string, nextRole: Role) {
    updateUser.mutate(
      { userId, input: { role: nextRole } },
      {
        onSuccess: () => toast.success(`${name} is now ${ROLE_LABELS[nextRole].toLowerCase()}`),
        // Without this the Select snapped back to the server value with no
        // explanation, which reads as the click having been ignored.
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : `Could not change ${name}'s role.`,
          ),
      },
    );
  }

  function confirmDeactivation() {
    const row = pendingDeactivation;
    if (!row) return;
    const reactivating = !row.isActive;
    updateUser.mutate(
      { userId: row.id, input: { isActive: reactivating } },
      {
        onSuccess: () => {
          toast.success(`${row.name}'s account was ${reactivating ? "reactivated" : "deactivated"}`);
          setPendingDeactivation(null);
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : `Could not update ${row.name}'s account.`,
          ),
      },
    );
  }

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
    }
    if (Object.keys(next).some((key) => key !== "page")) params.delete("page");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Accounts are provisioned here — there is no self-registration, so the audit trail's "who" is
            always a real, vetted person.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="h-10 rounded-full px-5">
          <UserPlus />
          Add user
        </Button>
      </div>

      <Card className="flex flex-row flex-wrap items-end gap-3 px-4 py-4">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Role</span>
          <Select value={role} onValueChange={(value) => update({ role: value })}>
            <SelectTrigger className="h-9 w-40" aria-label="Filter by role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={activeFilter} onValueChange={(value) => update({ active: value })}>
            <SelectTrigger className="h-9 w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {users.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : users.isError ? (
          <ErrorState message={(users.error as Error).message} onRetry={() => void users.refetch()} />
        ) : users.data.data.length === 0 ? (
          <EmptyState title="No accounts match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.data.data.map((row) => {
                  const isSelf = row.id === currentUser?.id;
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-accent/60">
                      <td className="px-4 py-3">
                        <PersonCell name={row.name} subtitle={row.email} />
                      </td>
                      <td className="px-4 py-3">
                        {/* Self-demotion was reachable here even though the
                            deactivate menu already guarded against it: a
                            supervisor could set their own role to Operator and
                            lose access to this page mid-session. */}
                        <Select
                          value={row.role}
                          disabled={isSelf}
                          onValueChange={(value) =>
                            changeRole(row.id, row.name, value as Role)
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-32 text-xs"
                            aria-label={`Role for ${row.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isSelf ? (
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            You cannot change your own role
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={row.isActive ? "secondary" : "outline"}>
                          {row.isActive ? "Active" : "Deactivated"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={isSelf}
                              aria-label={`Actions for ${row.name}`}
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant={row.isActive ? "destructive" : "default"}
                              onClick={() => setPendingDeactivation(row)}
                            >
                              {row.isActive ? "Deactivate account" : "Reactivate account"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {users.data && isOffsetMeta(users.data.pagination) ? (
          <OffsetPager meta={users.data.pagination} onPageChange={(next) => update({ page: String(next) })} />
        ) : null}
      </Card>

      <NewUserDialog open={isCreating} onClose={() => setIsCreating(false)} />

      <Dialog
        open={pendingDeactivation !== null}
        onOpenChange={(next) => !next && setPendingDeactivation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDeactivation?.isActive ? "Deactivate" : "Reactivate"} {pendingDeactivation?.name}?
            </DialogTitle>
            <DialogDescription>
              {pendingDeactivation?.isActive
                ? "They will not be able to sign in. Their cleaning records and every audit entry naming them are kept — deactivating an account never touches the trail."
                : "They will be able to sign in again with their existing password."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeactivation(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingDeactivation?.isActive ? "destructive" : "default"}
              onClick={confirmDeactivation}
              disabled={updateUser.isPending}
            >
              {updateUser.isPending
                ? "Saving…"
                : pendingDeactivation?.isActive
                  ? "Deactivate account"
                  : "Reactivate account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
