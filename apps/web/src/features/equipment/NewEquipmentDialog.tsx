import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { useCreateEquipment } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";

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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add equipment</DialogTitle>
          <DialogDescription>Register a new asset to file cleaning records against.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <InlineAlert>{formError}</InlineAlert> : null}

          <FormField label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" placeholder="Mixing Tank 03" autoFocus {...register("name")} />
          </FormField>

          <FormField
            label="Asset code"
            htmlFor="code"
            error={errors.code?.message}
            hint="Uppercase letters and digits, e.g. MT-003. Must be unique."
            required
          >
            <Input id="code" placeholder="MT-003" {...register("code")} />
          </FormField>

          <FormField label="Status" error={errors.status?.message}>
            <Select
              value={watch("status")}
              onValueChange={(value) => setValue("status", value as CreateEquipmentFormValues["status"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="RETIRED">Retired</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
