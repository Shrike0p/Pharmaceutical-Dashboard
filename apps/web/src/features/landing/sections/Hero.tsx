import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-168 -translate-x-1/2 rounded-full bg-brand-600/[0.14] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-24 -right-32 -z-10 size-112 rounded-full bg-brand-300/20 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-20 pb-20 md:grid-cols-2 md:items-center md:pt-28 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">
            GxP audit trail
          </span>
          <h1 className="mt-5 font-heading text-5xl leading-[1.05] font-bold tracking-tight text-foreground md:text-6xl">
            Cleaning records that hold up under audit.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Field-level history for every change, who made it, and when, enforced by the database itself, not
            just the app.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button asChild size="lg" className="group/cta gap-2 rounded-full px-6 text-base">
              <Link to="/signin">
                Sign in
                <span className="flex size-5 items-center justify-center rounded-full bg-white/20 transition-transform group-hover/cta:translate-x-0.5">
                  <ArrowRight className="size-3" />
                </span>
              </Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-linear-to-br from-brand-600/[0.14] via-transparent to-brand-300/16" />
          <div className="overflow-hidden rounded-[1.75rem] bg-card ring-1 ring-foreground/[0.08] shadow-[var(--shadow-card-hover)]">
            <img
              src="/marketing/overview.png"
              alt="The Overview dashboard, showing equipment status, the verification backlog, and recent audit activity"
              className="w-full"
              width={1800}
              height={1125}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
