export function UnderTheHood() {
  return (
    <section id="under-the-hood" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid gap-12 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground">Under the hood</h2>
          <p className="mt-4 text-muted-foreground">
            Every audit entry stores field-level changes as JSONB, not a fixed set of
            "old status / new status" columns. When the record gains a field, the audit table does not
            need a migration.
          </p>
          <p className="mt-4 text-muted-foreground">
            The write itself runs inside a serializable transaction: the record update and the audit insert
            commit together, or neither does. A partially-written change is the one failure mode this
            system exists to prevent.
          </p>
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            GET /api/audit?changedById=…&field=status
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-shell-950 shadow-[var(--shadow-card-hover)]">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
            <span className="size-2.5 rounded-full bg-brand-600/60" />
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="ml-2 font-mono text-xs text-white/40">audit_logs.changes</span>
          </div>
          <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-relaxed text-white/80">
{`{
  "status": {
    "old": `}<span className="text-pending-600">&quot;PENDING&quot;</span>{`,
    "new": `}<span className="text-verify-600">&quot;VERIFIED&quot;</span>{`
  },
  "verifiedById": {
    "old": `}<span className="text-white/40">null</span>{`,
    "new": `}<span className="text-brand-300">&quot;01a0…40e9&quot;</span>{`
  },
  "verifiedAt": {
    "old": `}<span className="text-white/40">null</span>{`,
    "new": `}<span className="text-brand-300">&quot;2026-09-08T11:15:00Z&quot;</span>{`
  }
}`}
          </pre>
        </div>
      </div>
    </section>
  );
}
