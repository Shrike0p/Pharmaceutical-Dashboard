import { Database, GitBranch, Layers, ShieldCheck, UserCheck } from "lucide-react";

export function CapabilityBento() {
  return (
    <section id="capabilities" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground">
          Built for the questions an auditor actually asks
        </h2>
        <p className="mt-3 text-muted-foreground">
          Not a generic cleaning log with a history tab bolted on — every screen answers a specific
          compliance question.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card)] md:col-span-2 md:row-span-2">
          <div className="p-6 pb-0">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700">
              <Layers className="size-4" />
            </span>
            <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">Every asset, one filtered view</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              "Every CIP cleaning last week" is one query, not a spreadsheet stitched together from six
              equipment pages.
            </p>
          </div>
          <img
            src="/marketing/records.png"
            alt="The Cleaning Records page, filtered across equipment by status, method, and date range"
            className="mt-5 w-full border-t"
          />
        </div>

        <div className="rounded-3xl bg-card p-6 ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card)]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-verify-50 text-verify-700">
            <GitBranch className="size-4" />
          </span>
          <h3 className="mt-4 font-heading text-base font-semibold text-foreground">Stable under concurrent writes</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Keyset pagination anchors on a value, not a position, so an insert mid-scroll cannot repeat or
            skip a row.
          </p>
        </div>

        <div className="rounded-3xl bg-card p-6 ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card)]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-pending-50 text-pending-700">
            <UserCheck className="size-4" />
          </span>
          <h3 className="mt-4 font-heading text-base font-semibold text-foreground">No one signs off their own work</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A supervisor can verify any record except one where they are the operator on file.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card)] md:col-span-2">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="p-6">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700">
                <ShieldCheck className="size-4" />
              </span>
              <h3 className="mt-4 font-heading text-base font-semibold text-foreground">Search the trail, not just a record</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Filter by actor, asset, action, or field. "Everything Priya changed in March" is a real
                query here.
              </p>
            </div>
            <img
              src="/marketing/audit.png"
              alt="The Audit and Compliance page: every field-level change across every asset, filterable by actor, equipment, action, and field"
              className="h-full w-full border-t object-cover md:border-t-0 md:border-l"
            />
          </div>
        </div>

        <div className="rounded-3xl bg-card p-6 ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card)]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Database className="size-4" />
          </span>
          <h3 className="mt-4 font-heading text-base font-semibold text-foreground">Accounts are provisioned, not signed up</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            There is no public registration form. A supervisor creates every account, so the audit trail's
            "who" is always a real, vetted person.
          </p>
        </div>
      </div>
    </section>
  );
}
