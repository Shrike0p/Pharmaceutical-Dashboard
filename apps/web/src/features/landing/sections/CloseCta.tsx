import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";

// Lazy like every other consumer, per the rule in CLAUDE.md. Here the chunk is
// already in flight (this page's own scenes pull `three`), so it resolves
// immediately — the point is that no non-landing route can ever pick it up.
const GradientCanvas = lazy(() =>
  import("@/components/three/GradientCanvas").then((module) => ({ default: module.GradientCanvas })),
);

export function CloseCta() {
  return (
    <section className="px-4 py-20 sm:px-6">
      {/* The page closes on the same dark aurora band the dashboard opens
          with, so the last thing a visitor sees is the thing they are about to
          sign in to. */}
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-shell-950">
        <Suspense fallback={null}>
          <GradientCanvas palette="shell" className="absolute inset-0" />
        </Suspense>
        <div aria-hidden className="absolute inset-0 bg-shell-950/55" />

        <div className="relative mx-auto max-w-2xl px-6 py-20 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <BrandMark className="size-7" />
          </span>
          <h2 className="mt-6 font-heading text-4xl font-bold tracking-tight text-white">
            See the audit trail on real data.
          </h2>
          <p className="mt-3 text-white/70">
            Four seeded accounts, one for each role, already provisioned on the sign-in page.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 h-11 rounded-full bg-white px-6 text-base text-ink-900 shadow-none hover:bg-white/90"
          >
            <Link to="/signin">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:px-6 md:flex-row md:justify-between md:text-left">
        <div className="flex items-center gap-2">
          <BrandMark className="size-5" />
          <span className="font-heading text-sm font-medium text-foreground">Equipment Cleaning Log</span>
        </div>
        <p className="text-xs text-muted-foreground">
          A take-home project for pharmaceutical equipment cleaning compliance. Not affiliated with any
          real manufacturing operation.
        </p>
      </div>
    </footer>
  );
}
