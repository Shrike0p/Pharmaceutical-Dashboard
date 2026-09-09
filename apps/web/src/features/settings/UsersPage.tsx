import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EllipsisVertical, UserPlus } from "lucide-react";
import { isOffsetMeta, ROLES, ROLE_LABELS, type Role } from "@ecl/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/data-states";
import { OffsetPager } from "@/components/OffsetPager";
import { useAuth } from "@/lib/auth";
import { useUpdateUserAdmin, useUsersAdmin } from "@/hooks/queries";
import { formatDate } from "@/lib/format";
import { NewUserDialog } from "./NewUserDialog";

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const role = (searchParams.get("role") ?? "ALL") as Role | "ALL";
  const activeFilter = searchParams.get("active") ?? "ALL";
  const [isCreating, setIsCreating] = useState(false);

  const users = useUsersAdmin({
    page,
    limit: 20,
    ...(role !== "ALL" ? { role } : {}),
    ...(activeFilter !== "ALL" ? { isActive: activeFilter === "true" } : {}),
  });
  const updateUser = useUpdateUserAdmin();

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
          <h1 className="text-lg font-semibold text-foreground">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Accounts are provisioned here — there is no self-registration, so the audit trail's "who" is
            always a real, vetted person.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <UserPlus />
          Add user
        </Button>
      </div>

      <Card className="flex flex-row flex-wrap items-end gap-3 px-4 py-4">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Role</span>
          <Select value={role} onValueChange={(value) => update({ role: value })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
                <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
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
                    <tr key={row.id} className="hover:bg-accent">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={row.role}
                          onValueChange={(value) =>
                            updateUser.mutate({ userId: row.id, input: { role: value as Role } })
                          }
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
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
                            <Button variant="ghost" size="icon-sm" disabled={isSelf} title={isSelf ? "You cannot deactivate your own account" : undefined}>
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant={row.isActive ? "destructive" : "default"}
                              onClick={() =>
                                updateUser.mutate({ userId: row.id, input: { isActive: !row.isActive } })
                              }
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
    </div>
  );
}
