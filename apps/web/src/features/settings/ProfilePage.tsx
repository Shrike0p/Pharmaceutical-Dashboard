import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { newPasswordSchema, ROLE_LABELS } from "@ecl/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

export function ProfilePage() {
  const { user } = useAuth();
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSuccess(false);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      setSuccess(true);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Your identity and account security.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback className="text-base">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {ROLE_LABELS[user.role]}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Takes effect the next time you sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <InlineAlert>{formError}</InlineAlert> : null}
            {success ? (
              <p role="status" className="rounded-md bg-verify-50 px-3 py-2 text-sm text-verify-700">
                Password changed.
              </p>
            ) : null}

            <FormField label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
              <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
            </FormField>

            <FormField
              label="New password"
              htmlFor="newPassword"
              error={errors.newPassword?.message}
              hint="At least 8 characters."
              required
            >
              <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
            </FormField>

            <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </FormField>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Changing…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
