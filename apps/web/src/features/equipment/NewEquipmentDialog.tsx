import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Wrench } from "lucide-react";
import {
  createEquipmentSchema,
  type CreateEquipmentFormValues,
  type CreateEquipmentInput,
} from "@ecl/shared";
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
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { useCreateEquipment } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";

const STATUSES = [
  { value: "ACTIVE", label: "Active", hint: "Records can be filed" },
  { value: "RETIRED", label: "Retired", hint: "History kept, read-only" },
] as const;

export function NewEquipmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createEquipment = useCreateEquipment();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateEquipmentFormValues, unknown, CreateEquipmentInput>({
    resolver: zodResolver(createEquipmentSchema),
    defaultValues: { name: "", code: "", status: "ACTIVE" },
  });

  useEffect(() => {
    if (open) {
      reset({ name: "", code: "", status: "ACTIVE" });
      setFormError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createEquipment.mutateAsync(values);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        // The API reports which field conflicted, so highlight that input
        // rather than showing an unattached banner.
        for (const detail of error.details) {
          setError(detail.path as keyof CreateEquipmentFormValues, { message: detail.message });
        }
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "Unable to add equipment.");
    }
  });

  const codeField = register("code");
  const name = watch("name");
  const code = watch("code");
  const status = watch("status");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Wrench className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-heading text-lg font-bold">Add equipment</DialogTitle>
              <DialogDescription>Register a new asset to file cleaning records against.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <InlineAlert>{formError}</InlineAlert> : null}

          <FormField label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" placeholder="Mixing Tank 03" autoFocus className="h-11" {...register("name")} />
          </FormField>

          <FormField
            label="Asset code"
            htmlFor="code"
            error={errors.code?.message}
            hint="Uppercase letters and digits, e.g. MT-003. Must be unique."
            required
          >
            <Input
              id="code"
              placeholder="MT-003"
              className="h-11 font-mono"
              autoCapitalize="characters"
              {...codeField}
              // The schema only accepts uppercase, so upper-casing as the user
              // types removes a validation error nobody needs to see.
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
                void codeField.onChange(event);
              }}
            />
          </FormField>

          <FormField label="Status" error={errors.status?.message}>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={status === option.value}
                  onClick={() => setValue("status", option.value, { shouldValidate: true })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    status === option.value
                      ? "border-brand-600 bg-brand-50"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      status === option.value ? "text-brand-700" : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </FormField>

          {/* Shows the row exactly as it will appear in the equipment table,
              monogram included, so a mistyped code is obvious before saving. */}
          <div className="rounded-xl border border-dashed bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-[11px] font-bold text-brand-700">
                {code ? code.split("-")[0]?.slice(0, 3) : "—"}
              </span>
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {name || "Asset name"}
                </span>
                <span className="block font-mono text-xs text-muted-foreground">{code || "CODE"}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="rounded-full px-5">
              {isSubmitting ? "Adding…" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
