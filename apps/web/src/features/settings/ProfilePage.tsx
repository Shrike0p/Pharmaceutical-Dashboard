import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ClipboardList, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { newPasswordSchema, ROLE_LABELS, type Role } from "@ecl/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { initials } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useChangePassword } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";

const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/**
 * What each role may actually do, taken from the rules the API enforces —
 * not a generic "you have access to the dashboard" blurb. A person reading
 * their own profile should be able to learn why a button is missing elsewhere.
 */
const ROLE_CAPABILITIES: Record<Role, { icon: LucideIcon; can: string[]; cannot: string[] }> = {
  OPERATOR: {
    icon: ClipboardList,
    can: ["Record a cleaning against any asset", "Amend a record, with the change kept in the trail"],
    cannot: ["Verify a record", "Add or retire equipment", "Provision accounts"],
  },
  SUPERVISOR: {
    icon: ShieldCheck,
    can: [
      "Verify pending records — except your own cleanings",
      "Add, edit and retire equipment",
      "Provision and deactivate accounts",
    ],
    cannot: ["Verify a cleaning you performed yourself", "Edit or delete an audit entry"],
  },
  AUDITOR: {
    icon: Lock,
    can: ["Read every cleaning record", "Read and filter the complete audit trail"],
    cannot: ["Record a cleaning", "Verify a record", "Change any data at all"],
  },
};

/**
 * Scores the *shape* of the new password so the meter cannot claim more than
 * it knows: it is a composition check, not an entropy estimate, and it is
 * labelled that way. The API is still the authority on what it accepts.
 */
function passwordStrength(value: string): { score: number; label: string } {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] ?? "" };
}

const STRENGTH_TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-pending-600",
  "bg-verify-600",
  "bg-verify-700",
];

function PasswordInput({
  id,
  autoComplete,
  ...props
}: React.ComponentProps<typeof Input> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        className="h-10 pr-11"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const strength = passwordStrength(watch("newPassword"));

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      toast.success("Password changed", { description: "Use it the next time you sign in." });
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        for (const detail of error.details) {
          setError(detail.path as keyof ChangePasswordFormValues, { message: detail.message });
        }
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "Unable to change password.");
    }
  });

  if (!user) return null;

  const capabilities = ROLE_CAPABILITIES[user.role];
  const RoleIcon = capabilities.icon;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Your identity, what your role allows, and account security.</p>
      </div>

      {/* Identity banner. A CSS gradient rather than the Three.js panel used on
          sign-in — a settings page is not worth a 519KB dependency. */}
      <Card className="mt-6 overflow-hidden py-0">
        <div aria-hidden className="h-24 bg-linear-to-r from-brand-700 via-brand-600 to-[#8b5cf6]" />
        <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 pb-5">
          <Avatar className="-mt-10 size-20 ring-4 ring-card">
            <AvatarFallback className="bg-brand-50 font-heading text-xl font-bold text-brand-700">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl font-bold text-foreground">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <RoleIcon className="size-3" />
            {ROLE_LABELS[user.role]}
          </Badge>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              Change password
            </CardTitle>
            <CardDescription>Takes effect the next time you sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {formError ? <InlineAlert>{formError}</InlineAlert> : null}

              <FormField
                label="Current password"
                htmlFor="currentPassword"
                error={errors.currentPassword?.message}
                required
              >
                <PasswordInput
                  id="currentPassword"
                  autoComplete="current-password"
                  {...register("currentPassword")}
                />
              </FormField>

              <FormField
                label="New password"
                htmlFor="newPassword"
                error={errors.newPassword?.message}
                hint="At least 8 characters."
                required
              >
                <PasswordInput id="newPassword" autoComplete="new-password" {...register("newPassword")} />
              </FormField>

              {strength.label ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((segment) => (
                      <span
                        key={segment}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          segment < strength.score ? STRENGTH_TONES[strength.score] : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  {/* Named as composition, not strength-in-bits — the meter
                      only knows length and character classes. */}
                  <span className="text-xs text-muted-foreground">{strength.label}</span>
                </div>
              ) : null}

              <FormField
                label="Confirm new password"
                htmlFor="confirmPassword"
                error={errors.confirmPassword?.message}
                required
              >
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
              </FormField>

              <Button type="submit" disabled={isSubmitting} className="h-10 rounded-full px-5">
                {isSubmitting ? "Changing…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RoleIcon className="size-4 text-muted-foreground" />
              What {ROLE_LABELS[user.role].toLowerCase()} allows
            </CardTitle>
            <CardDescription>Enforced by the API, not just hidden in the interface.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2">
              {capabilities.can.map((item) => (
                <li key={item} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verify-700" />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2 border-t pt-4">
              {capabilities.cannot.map((item) => (
                <li key={item} className="flex gap-2">
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              Your name is written onto every record and audit entry you create. Only a supervisor can
              change your role.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
