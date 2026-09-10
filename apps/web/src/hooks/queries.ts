import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type {
  AuditAction,
  AuditEntryDto,
  ChangePasswordInput,
  CleaningMethod,
  CleaningRecordDto,
  CreateCleaningRecordInput,
  CreateEquipmentInput,
  CreateUserInput,
  DashboardStatsDto,
  EquipmentDto,
  EquipmentStatus,
  GlobalAuditEntryDto,
  GlobalCleaningRecordDto,
  Paginated,
  PaginationMode,
  RecordStatus,
  Role,
  UpdateCleaningRecordInput,
  UpdateUserInput,
  UserAdminDto,
  UserSummaryDto,
} from "@ecl/shared";
import { apiRequest, buildQuery } from "../lib/api-client";

/**
 * Query keys are centralised so an invalidation cannot silently miss a cache
 * entry because two call sites spelled the key differently.
 */
export const queryKeys = {
  users: ["users"] as const,
  usersAdmin: (params: UserAdminListParams) => ["users", "admin", params] as const,
  equipmentList: (params: EquipmentListParams) => ["equipment", "list", params] as const,
  equipment: (id: string) => ["equipment", "detail", id] as const,
  records: (equipmentId: string, params: RecordListParams) =>
    ["equipment", equipmentId, "records", params] as const,
  audit: (recordId: string) => ["records", recordId, "audit"] as const,
  globalRecords: (params: GlobalRecordListParams) => ["records", "global", params] as const,
  globalAudit: (params: GlobalAuditListParams) => ["audit", "global", params] as const,
  dashboardStats: ["dashboard", "stats"] as const,
};

export interface EquipmentListParams {
  page: number;
  limit: number;
  search?: string;
  status?: EquipmentStatus;
}

export interface RecordListParams {
  mode: PaginationMode;
  page: number;
  limit: number;
  status?: RecordStatus;
  cursor?: string;
}

export interface GlobalRecordListParams {
  mode: PaginationMode;
  page: number;
  limit: number;
  status?: RecordStatus;
  cursor?: string;
  equipmentId?: string;
  cleanedById?: string;
  method?: CleaningMethod;
  from?: string;
  to?: string;
}

export interface GlobalAuditListParams {
  page: number;
  limit: number;
  action?: AuditAction;
  changedById?: string;
  equipmentId?: string;
  field?: string;
  from?: string;
  to?: string;
}

export interface UserAdminListParams {
  page: number;
  limit: number;
  role?: Role;
  isActive?: boolean;
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
        `/api/equipment${buildQuery({
          page: params.page,
          limit: params.limit,
          search: params.search,
          status: params.status,
        })}`,
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

/** Cross-equipment cleaning records — the Cleaning Records page. */
export function useGlobalCleaningRecords(params: GlobalRecordListParams) {
  return useQuery({
    queryKey: queryKeys.globalRecords(params),
    queryFn: () =>
      apiRequest<Paginated<GlobalCleaningRecordDto>>(
        `/api/cleaning-records${buildQuery({
          mode: params.mode,
          page: params.mode === "offset" ? params.page : undefined,
          limit: params.limit,
          status: params.status,
          cursor: params.mode === "cursor" ? params.cursor : undefined,
          equipmentId: params.equipmentId,
          cleanedById: params.cleanedById,
          method: params.method,
          from: params.from,
          to: params.to,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

/** The compliance-wide audit trail — the Audit & Compliance page. */
export function useGlobalAuditTrail(params: GlobalAuditListParams) {
  return useQuery({
    queryKey: queryKeys.globalAudit(params),
    queryFn: () =>
      apiRequest<Paginated<GlobalAuditEntryDto>>(
        `/api/audit${buildQuery({
          page: params.page,
          limit: params.limit,
          action: params.action,
          changedById: params.changedById,
          equipmentId: params.equipmentId,
          field: params.field,
          from: params.from,
          to: params.to,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => apiRequest<{ data: DashboardStatsDto }>("/api/dashboard/stats").then((r) => r.data),
    // Stats are a summary, not a live counter — a moderate staleness is fine
    // and keeps the overview page from refetching on every focus.
    staleTime: 60_000,
  });
}

/** The account-management table — supervisor only. */
export function useUsersAdmin(params: UserAdminListParams) {
  return useQuery({
    queryKey: queryKeys.usersAdmin(params),
    queryFn: () =>
      apiRequest<Paginated<UserAdminDto>>(
        `/api/users${buildQuery({
          page: params.page,
          limit: params.limit,
          role: params.role,
          isActive: params.isActive === undefined ? undefined : String(params.isActive),
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

// --- Writes ---------------------------------------------------------------

/**
 * Writing one cleaning record invalidates six things, because six views read
 * some projection of it. Forgetting the audit key is what makes a trail appear
 * to "miss" the change just made; forgetting the three global keys is worse,
 * because `staleTime` (30s) and `refetchOnWindowFocus: false` mean the
 * cross-equipment Records list, the compliance Audit trail and the dashboard
 * counters keep serving the pre-write values with no visible reason.
 */
function useRecordInvalidation(equipmentId: string) {
  const client = useQueryClient();
  return (recordId?: string) => {
    void client.invalidateQueries({ queryKey: ["equipment", equipmentId, "records"] });
    void client.invalidateQueries({ queryKey: queryKeys.equipment(equipmentId) });
    void client.invalidateQueries({ queryKey: ["equipment", "list"] });
    void client.invalidateQueries({ queryKey: ["records", "global"] });
    void client.invalidateQueries({ queryKey: ["audit", "global"] });
    void client.invalidateQueries({ queryKey: queryKeys.dashboardStats });
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
      // The Equipment page's summary tiles read the dashboard read model, so
      // without this a newly added asset does not move the counts above the
      // table it just appeared in.
      void client.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiRequest<void>("/api/auth/password", { method: "POST", body: input }),
  });
}

export function useCreateUserAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiRequest<{ data: UserAdminDto }>("/api/users", { method: "POST", body: input }).then(
        (r) => r.data,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateUserInput }) =>
      apiRequest<{ data: UserAdminDto }>(`/api/users/${userId}`, { method: "PATCH", body: input }).then(
        (r) => r.data,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
