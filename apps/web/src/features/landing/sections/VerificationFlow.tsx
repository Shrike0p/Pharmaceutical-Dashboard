import { CircleCheckBig, ClipboardList, Lock, UserCheck } from "lucide-react";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Record",
    body: "An operator logs a cleaning against the exact asset, method, and time.",
  },
  {
    icon: UserCheck,
    title: "Review",
    body: "A supervisor reads the record. They cannot verify their own work.",
  },
  {
    icon: CircleCheckBig,
    title: "Verify",
    body: "The status moves from pending to verified. That transition is itself an audit entry.",
  },
  {
    icon: Lock,
    title: "Retain",
    body: "The entry is written once. A database trigger refuses every later edit.",
  },
];

export function VerificationFlow() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground">How a record earns trust</h2>
        <p className="mt-3 text-muted-foreground">
          Four steps, each one leaving a mark the next step cannot erase.
        </p>
      </div>

      <div className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div
          aria-hidden
          className="absolute top-6 right-0 left-0 hidden h-px bg-linear-to-r from-transparent via-border to-transparent lg:block"
        />
        {STEPS.map((step) => (
          <div key={step.title} className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="relative z-10 flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-brand-600 to-brand-700 text-white shadow-[var(--shadow-card)]">
              <step.icon className="size-5" />
            </span>
            <h3 className="mt-4 font-heading text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
