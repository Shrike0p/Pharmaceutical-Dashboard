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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/data-states";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { toDateTimeLocalValue } from "@/lib/format";
import { useCreateCleaningRecord, useUpdateCleaningRecord, useUsers } from "@/hooks/queries";

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
    setValue,
    watch,
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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit cleaning record" : "Record a cleaning"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Every change is recorded in the audit trail, field by field."
              : "The record starts as pending until a supervisor verifies it."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError ? <InlineAlert>{formError}</InlineAlert> : null}

          <FormField label="Cleaned by" error={errors.cleanedById?.message} required>
            <Select value={watch("cleanedById")} onValueChange={(value) => setValue("cleanedById", value)}>
              <SelectTrigger className="w-full" disabled={users.isPending}>
                <SelectValue placeholder={users.isPending ? "Loading…" : "Select a person"} />
              </SelectTrigger>
              <SelectContent>
                {users.data?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Cleaned at" htmlFor="cleanedAt" error={errors.cleanedAt?.message} required>
            <Input id="cleanedAt" type="datetime-local" {...register("cleanedAt")} />
          </FormField>

          <FormField label="Method" error={errors.method?.message} required>
            <Select value={watch("method")} onValueChange={(value) => setValue("method", value as CreateCleaningRecordInput["method"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLEANING_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {CLEANING_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Notes" htmlFor="notes" error={errors.notes?.message} hint="Optional. Up to 2000 characters.">
            <Textarea
              id="notes"
              rows={3}
              placeholder="Observations, deviations, sample references…"
              {...register("notes")}
            />
          </FormField>

          {requiresReason ? (
            <FormField
              label="Reason for amendment"
              htmlFor="reason"
              required
              hint="This record has been verified, so the change needs a documented reason."
            >
              <Input
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Transcription error on the batch sheet"
              />
            </FormField>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || (requiresReason && reason.trim().length < 3)}>
              {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Save record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
