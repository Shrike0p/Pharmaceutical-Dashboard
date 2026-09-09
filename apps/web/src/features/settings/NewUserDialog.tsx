import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, ROLES, ROLE_LABELS, type CreateUserInput } from "@ecl/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { useCreateUserAdmin } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";

export function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUserAdmin();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "OPERATOR", password: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ name: "", email: "", role: "OPERATOR", password: "" });
      setFormError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createUser.mutateAsync(values);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        for (const detail of error.details) {
          setError(detail.path as keyof CreateUserInput, { message: detail.message });
        }
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "Unable to create the account.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Accounts are provisioned, not self-registered — the audit trail's "who" has to mean something.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <InlineAlert>{formError}</InlineAlert> : null}

          <FormField label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" autoFocus {...register("name")} />
          </FormField>

          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" {...register("email")} />
          </FormField>

          <FormField label="Role" error={errors.role?.message} required>
            <Select value={watch("role")} onValueChange={(value) => setValue("role", value as CreateUserInput["role"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Initial password"
            htmlFor="password"
            error={errors.password?.message}
            hint="At least 8 characters. They can change it from their own profile."
            required
          >
            <Input id="password" type="password" {...register("password")} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
