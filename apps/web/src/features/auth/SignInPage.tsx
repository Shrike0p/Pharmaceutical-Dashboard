import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@ecl/shared";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { BrandMark } from "@/components/BrandMark";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

/**
 * `three` is only needed for the decorative panel, so it is split out of the
 * app bundle and loaded behind the CSS-gradient fallback below.
 */
const GradientCanvas = lazy(() =>
  import("@/components/three/GradientCanvas").then((module) => ({ default: module.GradientCanvas })),
);

/** Shown beside the form so a reviewer can get in without reading the README. */
const DEMO_ACCOUNTS = [
  { role: "Operator", name: "Rahul Verma", email: "rahul.verma@example.com", can: "Record and amend cleanings" },
  { role: "Supervisor", name: "Priya Nair", email: "priya.nair@example.com", can: "Verify cleanings, manage equipment" },
  { role: "Auditor", name: "Anita Rao", email: "anita.rao@example.com", can: "Read-only review" },
];
const DEMO_PASSWORD = "Password123!";

export function SignInPage() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    // The same schema the API validates with, so the two cannot disagree.
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Unable to sign in. Please try again.");
    }
  });

  function fillDemoAccount(email: string) {
    setValue("email", email, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-14">
        <Link to="/" className="flex w-fit items-center gap-2">
          <BrandMark className="size-6" />
          <span className="font-heading text-sm font-semibold text-foreground">Equipment Cleaning Log</span>
        </Link>

        <div className="flex flex-1 items-center py-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-2 text-muted-foreground">
              Sign in to record cleanings, verify them, and read the audit trail.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
              {formError ? <InlineAlert>{formError}</InlineAlert> : null}

              <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="you@example.com"
                  className="h-11"
                  {...register("email")}
                />
              </FormField>

              <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 pr-11"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FormField>

              <Button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-full text-base">
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-8">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Demo accounts
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <ul className="mt-4 space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email}>
                    <button
                      type="button"
                      onClick={() => fillDemoAccount(account.email)}
                      className="group flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-brand-300 hover:shadow-[var(--shadow-card)]"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
                        {initials(account.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{account.role}</span>
                        <span className="block truncate text-xs text-muted-foreground">{account.can}</span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-brand-700 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs text-muted-foreground">
                Password for all three: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{DEMO_PASSWORD}</code>
              </p>
            </div>

            <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              Accounts are provisioned by a supervisor. There is deliberately no self-registration — the
              audit trail's &ldquo;who&rdquo; has to be a real, vetted person.
            </p>
          </div>
        </div>
      </div>

      {/* The decorative panel. Hidden below lg, where it would only push the
          form off the first screen. */}
      <div className="hidden p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-[#3b0d63]">
          <Suspense fallback={null}>
            <GradientCanvas palette="brand" className="absolute inset-0" />
          </Suspense>

          {/* Guarantees text contrast no matter where the animation happens to
              be in its cycle. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-black/65 via-black/10 to-black/20"
          />

          <div className="relative flex h-full flex-col justify-between p-10">
            <span className="w-fit rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase backdrop-blur-sm">
              GxP audit trail
            </span>

            <div>
              <p className="font-heading text-4xl leading-tight font-bold text-white">
                Every change, attributable.
              </p>
              <p className="mt-3 max-w-sm text-white/70">
                Field-level history, an actor on every edit, and an append-only table the application
                itself cannot rewrite.
              </p>

              {/* A real audit entry in the shape the app stores it — not a stock
                  testimonial. */}
              <div className="mt-8 max-w-sm rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Status</p>
                <p className="mt-1.5 flex items-center gap-2 font-heading text-lg font-semibold text-white">
                  <span className="text-white/50 line-through">Pending</span>
                  <ArrowRight className="size-4 text-white/60" />
                  <span>Verified</span>
                </p>
                <div className="mt-4 flex items-center gap-2.5 border-t border-white/15 pt-4">
                  <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white">
                    PN
                  </span>
                  <span className="text-sm text-white/80">Priya Nair</span>
                  <span className="ml-auto font-mono text-xs text-white/60">8 Sep 2026, 11:15</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
