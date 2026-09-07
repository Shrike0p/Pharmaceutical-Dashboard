import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createEquipmentSchema,
  type CreateEquipmentFormValues,
  type CreateEquipmentInput,
} from "@ecl/shared";
import { Button, Field, InlineAlert, Input, Modal, Select } from "../../components/ui";
import { ApiError } from "../../lib/api-client";
import { useCreateEquipment } from "../../hooks/queries";

export function NewEquipmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createEquipment = useCreateEquipment();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
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
    <Modal open={open} onClose={onClose} title="Add equipment">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? <InlineAlert>{formError}</InlineAlert> : null}

        <Field label="Name" error={errors.name?.message} required>
          <Input placeholder="Mixing Tank 03" {...register("name")} />
        </Field>

        <Field
          label="Asset code"
          error={errors.code?.message}
          hint="Uppercase letters and digits, e.g. MT-003. Must be unique."
          required
        >
          <Input placeholder="MT-003" {...register("code")} />
        </Field>

        <Field label="Status" error={errors.status?.message}>
          <Select {...register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="RETIRED">Retired</option>
          </Select>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add equipment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
