const FIGURES = [
  { value: "77", label: "automated tests, including the failure modes" },
  { value: "2", label: "pagination strategies, proven stable under concurrent writes" },
  { value: "0", label: "ways to edit a record once it has been written" },
];

export function StakesBand() {
  return (
    <section className="border-y bg-muted/40 py-16">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <p className="font-heading text-xl font-medium text-foreground md:text-2xl">
          A regulator does not ask if a tank was cleaned. They ask who cleaned it, when it was verified, and
          whether the record could have been altered afterward.
        </p>
        <div className="mt-10 grid grid-cols-3 divide-x divide-border">
          {FIGURES.map((figure) => (
            <div key={figure.label} className="px-4">
              <p className="font-heading text-4xl font-bold tabular-nums text-brand-600">{figure.value}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{figure.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
