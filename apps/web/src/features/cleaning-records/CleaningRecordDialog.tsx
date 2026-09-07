import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CLEANING_METHODS,
  CLEANING_METHOD_LABELS,
  createCleaningRecordSchema,
  type CleaningRecordDto,
  type CreateCleaningRecordInput,
} from "@ecl/shared";
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea } from "../../components/ui";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth";
import { toDateTimeLocalValue } from "../../lib/format";
import { useCreateCleaningRecord, useUpdateCleaningRecord, useUsers } from "../../hooks/queries";

/**
 * One dialog for both creating and editing. The form shape is identical; only
 * the submit target and the "reason" requirement differ.
 */
export function CleaningRecordDialog({
  equipmentId,
  record,
  open,
  onClose,
}: {
  equipmentId: string;
  record: CleaningRecordDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const isEditing = record !== null;
  const { user } = useAuth();
  const users = useUsers();
  const create = useCreateCleaningRecord(equipmentId);
  const update = useUpdateCleaningRecord(equipmentId);
  const [formError, setFormError] = useState<string | null>(null);

  // Amending a record that has already been signed off requires a stated
  // reason, which the API enforces and the form collects up front.
  const requiresReason = record?.status === "VERIFIED";
  const [reason, setReason] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateCleaningRecordInput>({
    // The same schema the API validates with — including the "not in the
    // future" rule — so the client cannot drift from the server's definition.
    resolver: zodResolver(createCleaningRecordSchema),
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setReason("");
    reset({
      cleanedById: record?.cleanedBy.id ?? user?.id ?? "",
      cleanedAt: toDateTimeLocalValue(record?.cleanedAt ?? new Date()),
      method: record?.method ?? "CIP",
      notes: record?.notes ?? "",
    });
  }, [open, record, reset, user?.id]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // An empty textarea means "no notes", not an empty string.
    const notes = values.notes?.trim() ? values.notes.trim() : null;

    try {
      if (isEditing) {
        await update.mutateAsync({
          recordId: record.id,
          input: {
            cleanedById: values.cleanedById,
            cleanedAt: values.cleanedAt,
            method: values.method,
            notes,
            ...(requiresReason ? { reason } : {}),
          },
        });
      } else {
        await create.mutateAsync({ ...values, notes });
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        for (const detail of error.details) {
          if (detail.path === "reason") continue;
          setError(detail.path as keyof CreateCleaningRecordInput, { message: detail.message });
        }
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "Unable to save the record.");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit cleaning record" : "Record a cleaning"}
      description={
        isEditing
          ? "Every change is recorded in the audit trail, field by field."
          : "The record starts as pending until a supervisor verifies it."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? <InlineAlert>{formError}</InlineAlert> : null}

        <Field label="Cleaned by" error={errors.cleanedById?.message} required>
          <Select {...register("cleanedById")} disabled={users.isPending}>
            <option value="">{users.isPending ? "Loading…" : "Select a person"}</option>
            {users.data?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Cleaned at" error={errors.cleanedAt?.message} required>
          <Input type="datetime-local" {...register("cleanedAt")} />
        </Field>

        <Field label="Method" error={errors.method?.message} required>
          <Select {...register("method")}>
            {CLEANING_METHODS.map((method) => (
              <option key={method} value={method}>
                {CLEANING_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" error={errors.notes?.message} hint="Optional. Up to 2000 characters.">
          <Textarea rows={3} placeholder="Observations, deviations, sample references…" {...register("notes")} />
        </Field>

        {requiresReason ? (
          <Field
            label="Reason for amendment"
            required
            hint="This record has been verified, so the change needs a documented reason."
          >
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Transcription error on the batch sheet"
            />
          </Field>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={requiresReason && reason.trim().length < 3}
          >
            {isEditing ? "Save changes" : "Save record"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
