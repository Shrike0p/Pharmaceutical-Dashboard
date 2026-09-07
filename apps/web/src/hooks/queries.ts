import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type {
  AuditEntryDto,
  CleaningRecordDto,
  CreateCleaningRecordInput,
  CreateEquipmentInput,
  EquipmentDto,
  Paginated,
  PaginationMode,
  RecordStatus,
  UpdateCleaningRecordInput,
  UserSummaryDto,
} from "@ecl/shared";
import { apiRequest, buildQuery } from "../lib/api-client";

/**
 * Query keys are centralised so an invalidation cannot silently miss a cache
 * entry because two call sites spelled the key differently.
 */
export const queryKeys = {
  users: ["users"] as const,
  equipmentList: (params: EquipmentListParams) => ["equipment", "list", params] as const,
  equipment: (id: string) => ["equipment", "detail", id] as const,
  records: (equipmentId: string, params: RecordListParams) =>
    ["equipment", equipmentId, "records", params] as const,
  audit: (recordId: string) => ["records", recordId, "audit"] as const,
};

export interface EquipmentListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface RecordListParams {
  mode: PaginationMode;
  page: number;
  limit: number;
  status?: RecordStatus;
  cursor?: string;
}

// --- Reads ----------------------------------------------------------------

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => apiRequest<{ data: UserSummaryDto[] }>("/api/auth/users").then((r) => r.data),
    // The staff directory changes far less often than the data around it.
    staleTime: 5 * 60_000,
  });
}

export function useEquipmentList(params: EquipmentListParams) {
  return useQuery({
    queryKey: queryKeys.equipmentList(params),
    queryFn: () =>
      apiRequest<Paginated<EquipmentDto>>(
        `/api/equipment${buildQuery({ page: params.page, limit: params.limit, search: params.search })}`,
      ),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a skeleton on every page change.
    placeholderData: keepPreviousData,
  });
}

export function useEquipment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.equipment(id ?? ""),
    queryFn: () => apiRequest<{ data: EquipmentDto }>(`/api/equipment/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCleaningRecords(equipmentId: string | undefined, params: RecordListParams) {
  return useQuery({
    queryKey: queryKeys.records(equipmentId ?? "", params),
    queryFn: () =>
      apiRequest<Paginated<CleaningRecordDto>>(
        `/api/equipment/${equipmentId}/cleaning-records${buildQuery({
          mode: params.mode,
          page: params.mode === "offset" ? params.page : undefined,
          limit: params.limit,
          status: params.status,
          cursor: params.mode === "cursor" ? params.cursor : undefined,
        })}`,
      ),
    enabled: Boolean(equipmentId),
    placeholderData: keepPreviousData,
  });
}

export function useAuditTrail(equipmentId: string | undefined, recordId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.audit(recordId ?? ""),
    queryFn: () =>
      apiRequest<Paginated<AuditEntryDto>>(
        `/api/equipment/${equipmentId}/cleaning-records/${recordId}/audit?limit=100`,
      ),
    enabled: Boolean(equipmentId && recordId),
  });
}

// --- Writes ---------------------------------------------------------------

/**
 * After any write the record list and that record's audit trail are both stale,
 * so both are invalidated. Forgetting the second is what makes an audit panel
 * appear to "miss" the change the user just made.
 */
function useRecordInvalidation(equipmentId: string) {
  const client = useQueryClient();
  return (recordId?: string) => {
    void client.invalidateQueries({ queryKey: ["equipment", equipmentId, "records"] });
    void client.invalidateQueries({ queryKey: queryKeys.equipment(equipmentId) });
    void client.invalidateQueries({ queryKey: ["equipment", "list"] });
    if (recordId) void client.invalidateQueries({ queryKey: queryKeys.audit(recordId) });
  };
}

export function useCreateCleaningRecord(equipmentId: string) {
  const invalidate = useRecordInvalidation(equipmentId);
  return useMutation({
    mutationFn: (input: CreateCleaningRecordInput) =>
      apiRequest<{ data: CleaningRecordDto }>(`/api/equipment/${equipmentId}/cleaning-records`, {
        method: "POST",
        body: input,
      }).then((r) => r.data),
    onSuccess: (record) => invalidate(record.id),
  });
}

export function useUpdateCleaningRecord(equipmentId: string) {
  const invalidate = useRecordInvalidation(equipmentId);
  return useMutation({
    mutationFn: ({ recordId, input }: { recordId: string; input: UpdateCleaningRecordInput }) =>
      apiRequest<{ data: CleaningRecordDto }>(
        `/api/equipment/${equipmentId}/cleaning-records/${recordId}`,
        { method: "PATCH", body: input },
      ).then((r) => r.data),
    onSuccess: (record) => invalidate(record.id),
  });
}

export function useCreateEquipment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEquipmentInput) =>
      apiRequest<{ data: EquipmentDto }>("/api/equipment", { method: "POST", body: input }).then(
        (r) => r.data,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["equipment", "list"] });
    },
  });
}
