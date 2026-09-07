import { useMemo, useState } from "react";
import type { AuditEntryDto, CleaningRecordDto } from "@ecl/shared";
import { Button, ErrorState, InlineAlert, Modal, RecordStatusBadge } from "../../components/ui";
import { useAuditTrail, useUpdateCleaningRecord, useUsers } from "../../hooks/queries";
import { fieldLabel, formatAuditValue, formatDateTime } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api-client";

export function AuditTrailPanel({
  equipmentId,
  record,
  onClose,
}: {
  equipmentId: string;
  record: CleaningRecordDto | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const users = useUsers();
  const trail = useAuditTrail(equipmentId, record?.id);
  const update = useUpdateCleaningRecord(equipmentId);
  const [actionError, setActionError] = useState<string | null>(null);

  const userNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of users.data ?? []) map.set(person.id, person.name);
    return map;
  }, [users.data]);

  const resolveUser = (id: string) => userNames.get(id);

  const canVerify =
    record !== null &&
    user?.role === "SUPERVISOR" &&
    record.status === "PENDING" &&
    // Segregation of duties, mirrored from the API so the button is not
    // offered when the server would refuse it.
    record.cleanedBy.id !== user.id;

  async function verify() {
    if (!record) return;
    setActionError(null);
    try {
      await update.mutateAsync({ recordId: record.id, input: { status: "VERIFIED" } });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Unable to verify the record.");
    }
  }

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      title="Audit trail"
      description={record ? `Cleaning on ${formatDateTime(record.cleanedAt)}` : undefined}
      width="max-w-2xl"
    >
      {record ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-3 text-sm">
              <RecordStatusBadge status={record.status} />
              <span className="text-slate-600">
                Cleaned by <span className="font-medium text-slate-800">{record.cleanedBy.name}</span>
              </span>
              {record.verifiedBy ? (
                <span className="text-slate-600">
                  Verified by <span className="font-medium text-slate-800">{record.verifiedBy.name}</span>
                </span>
              ) : null}
            </div>
            {canVerify ? (
              <Button onClick={() => void verify()} isLoading={update.isPending}>
                Verify record
              </Button>
            ) : null}
          </div>

          {actionError ? <InlineAlert>{actionError}</InlineAlert> : null}

          {trail.isPending ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading audit trail">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : trail.isError ? (
            <ErrorState message={(trail.error as Error).message} onRetry={() => void trail.refetch()} />
          ) : (
            <ol className="relative space-y-0 border-l border-slate-200 pl-6">
              {trail.data.data.map((entry) => (
                <AuditEntryItem key={entry.id} entry={entry} resolveUser={resolveUser} />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function AuditEntryItem({
  entry,
  resolveUser,
}: {
  entry: AuditEntryDto;
  resolveUser: (id: string) => string | undefined;
}) {
  const isCreate = entry.action === "CREATE";
  const changes = Object.entries(entry.changes);

  return (
    <li className="relative pb-6 last:pb-0">
      <span
        aria-hidden
        className={`absolute top-1.5 -left-[27px] size-3 rounded-full ring-4 ring-white ${
          isCreate ? "bg-brand-500" : "bg-slate-300"
        }`}
      />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-sm font-medium text-slate-900">
          {isCreate ? "Record created" : "Record updated"}
        </p>
        <p className="tnum text-xs text-slate-500">
          {formatDateTime(entry.changedAt)} · {entry.changedBy.name} ({entry.changedBy.role.toLowerCase()})
        </p>
      </div>

      {entry.reason ? (
        <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
          <span className="font-medium">Reason for amendment:</span> {entry.reason}
        </p>
      ) : null}

      <dl className="mt-2 space-y-1.5">
        {changes.map(([field, change]) => (
          <div key={field} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <dt className="w-28 shrink-0 text-xs text-slate-500">{fieldLabel(field)}</dt>
            <dd className="flex flex-wrap items-baseline gap-1.5">
              {/* On a creation there is no prior value, so showing "— →" for
                  every field would be noise; the arrow only earns its place
                  when something was genuinely replaced. */}
              {!isCreate ? (
                <>
                  <span className="text-slate-500 line-through decoration-slate-400">
                    {formatAuditValue(field, change.old, resolveUser)}
                  </span>
                  <span aria-hidden className="text-slate-400">
                    →
                  </span>
                </>
              ) : null}
              <span className="font-medium text-slate-900">
                {formatAuditValue(field, change.new, resolveUser)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
