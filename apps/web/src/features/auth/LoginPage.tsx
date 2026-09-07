import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@ecl/shared";
import { Button, Card, Field, InlineAlert, Input } from "../../components/ui";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth";

/** Shown on the sign-in card so a reviewer can get in without reading the README. */
const DEMO_ACCOUNTS = [
  { role: "Operator", email: "rahul.verma@example.com", can: "record and amend cleanings" },
  { role: "Supervisor", email: "priya.nair@example.com", can: "verify cleanings, manage equipment" },
  { role: "Auditor", email: "anita.rao@example.com", can: "read-only review" },
];
const DEMO_PASSWORD = "Password123!";

export function LoginPage() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

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
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Equipment Cleaning Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cleaning records and audit trail for pharmaceutical manufacturing
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <InlineAlert>{formError}</InlineAlert> : null}

            <Field label="Email" error={errors.email?.message} required>
              <Input type="email" autoComplete="username" autoFocus {...register("email")} />
            </Field>

            <Field label="Password" error={errors.password?.message} required>
              <Input type="password" autoComplete="current-password" {...register("password")} />
            </Field>

            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Demo accounts</p>
          <p className="mt-1 text-xs text-slate-500">
            Password for all: <code className="rounded bg-slate-100 px-1 py-0.5">{DEMO_PASSWORD}</code>
          </p>
          <ul className="mt-3 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => fillDemoAccount(account.email)}
                  className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="w-20 shrink-0 font-medium text-slate-700">{account.role}</span>
                  <span className="text-slate-500">{account.can}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
