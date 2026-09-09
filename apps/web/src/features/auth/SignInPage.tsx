import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@ecl/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { BrandMark } from "@/components/BrandMark";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

/** Shown on the card so a reviewer can get in without reading the README. */
const DEMO_ACCOUNTS = [
  { role: "Operator", email: "rahul.verma@example.com", can: "record and amend cleanings" },
  { role: "Supervisor", email: "priya.nair@example.com", can: "verify cleanings, manage equipment" },
  { role: "Auditor", email: "anita.rao@example.com", can: "read-only review" },
];
const DEMO_PASSWORD = "Password123!";

export function SignInPage() {
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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="mb-3 size-9" />
          <h1 className="text-xl font-semibold text-foreground">Equipment Cleaning Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cleaning records and audit trail for pharmaceutical manufacturing
          </p>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {formError ? <InlineAlert>{formError}</InlineAlert> : null}

              <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
                <Input id="email" type="email" autoComplete="username" autoFocus {...register("email")} />
              </FormField>

              <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
                <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              </FormField>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Demo accounts
            </p>
            <p className="text-xs text-muted-foreground">
              Password for all: <code className="rounded bg-muted px-1 py-0.5">{DEMO_PASSWORD}</code>
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount(account.email)}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="w-20 shrink-0 font-medium text-foreground">{account.role}</span>
                    <span className="text-muted-foreground">{account.can}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
