import type {
  AuditEntryDto,
  ChangeSet,
  CleaningMethod,
  CleaningRecordDto,
  CleaningRecordListQuery,
  CreateCleaningRecordInput,
  GlobalCleaningRecordDto,
  GlobalCleaningRecordListQuery,
  Paginated,
  PaginationQuery,
  RecordStatus,
  UpdateCleaningRecordInput,
  UserSummaryDto,
} from "@ecl/shared";
import { prisma, type TransactionClient } from "../../lib/prisma.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../errors/app-error.ts";
import {
  AUDITED_CLEANING_RECORD_FIELDS,
  diffFields,
  isEmptyChangeSet,
} from "../../domain/audit/diff.ts";
import {
  buildCursorMeta,
  buildOffsetMeta,
  decodeCursor,
  encodeCursor,
} from "../../domain/pagination/cursor.ts";
import { toUtcDayRange } from "../../domain/filters/date-range.ts";
import { assertEquipmentExists } from "../equipment/equipment.service.ts";
import { userSummarySelect } from "../auth/auth.service.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const recordInclude = {
  cleanedBy: { select: userSummarySelect },
  verifiedBy: { select: userSummarySelect },
} satisfies Prisma.CleaningRecordInclude;

type RecordRow = Prisma.CleaningRecordGetPayload<{ include: typeof recordInclude }>;

/**
 * The audited surface of a cleaning record, as plain scalars. The diff engine
 * works against this shape rather than a Prisma model so it stays free of any
 * ORM types.
 */
interface CleaningRecordFields {
  cleanedById: string;
  cleanedAt: Date;
  method: CleaningMethod;
  notes: string | null;
  status: RecordStatus;
  verifiedById: string | null;
  verifiedAt: Date | null;
}

function toDto(row: RecordRow): CleaningRecordDto {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    cleanedBy: row.cleanedBy,
    cleanedAt: row.cleanedAt.toISOString(),
    method: row.method,
    notes: row.notes,
    status: row.status,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCleaningRecords(
  equipmentId: string,
  query: CleaningRecordListQuery,
): Promise<Paginated<CleaningRecordDto>> {
  await assertEquipmentExists(equipmentId);

  const where: Prisma.CleaningRecordWhereInput = {
    equipmentId,
    ...(query.status ? { status: query.status } : {}),
  };

  // Newest cleaning first. `id` breaks ties so the order is total — without it
  // two records sharing a timestamp could swap places between requests, which
  // would break keyset pagination and make offset pages non-deterministic.
  const orderBy: Prisma.CleaningRecordOrderByWithRelationInput[] = [
    { cleanedAt: "desc" },
    { id: "desc" },
  ];

  // A supplied cursor implies keyset mode, so clients following `nextCursor`
  // links do not have to keep repeating `mode=cursor`.
  if (query.mode === "cursor" || query.cursor) {
    return listByCursor(where, orderBy, query.cursor, query.limit);
  }

  const [total, rows] = await prisma.$transaction([
    prisma.cleaningRecord.count({ where }),
    prisma.cleaningRecord.findMany({
      where,
      include: recordInclude,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: rows.map(toDto), pagination: buildOffsetMeta(query.page, query.limit, total) };
}

/**
 * Keyset page. `rawCursor` is undefined for the first page, which simply has no
 * seek predicate — the ordering and the "fetch one extra" trick are identical
 * either way, so both cases share one code path.
 */
async function listByCursor(
  where: Prisma.CleaningRecordWhereInput,
  orderBy: Prisma.CleaningRecordOrderByWithRelationInput[],
  rawCursor: string | undefined,
  limit: number,
): Promise<Paginated<CleaningRecordDto>> {
  let seek: Prisma.CleaningRecordWhereInput = {};

  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    const cleanedAt = new Date(cursor.cleanedAt);
    // The row-value comparison `(cleaned_at, id) < (:cleanedAt, :id)`, expressed
    // the way Prisma can build it. Prisma's own `cursor` option seeks on a
    // single unique column, which cannot express "same timestamp, smaller id" —
    // so it would drop rows whenever two cleanings share a timestamp.
    seek = { OR: [{ cleanedAt: { lt: cleanedAt } }, { cleanedAt, id: { lt: cursor.id } }] };
  }

  // Fetch one extra row to learn whether a further page exists, which avoids
  // the COUNT query that offset mode needs.
  const rows = await prisma.cleaningRecord.findMany({
    where: { AND: [where, seek] },
    include: recordInclude,
    orderBy,
    take: limit + 1,
  });

  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasNextPage && last ? encodeCursor({ cleanedAt: last.cleanedAt.toISOString(), id: last.id }) : null;

  return { data: page.map(toDto), pagination: buildCursorMeta(limit, nextCursor) };
}

const globalRecordInclude = {
  ...recordInclude,
  equipment: { select: { id: true, name: true, code: true, status: true } },
} satisfies Prisma.CleaningRecordInclude;

type GlobalRecordRow = Prisma.CleaningRecordGetPayload<{ include: typeof globalRecordInclude }>;

function toGlobalDto(row: GlobalRecordRow): GlobalCleaningRecordDto {
  return { ...toDto(row), equipment: row.equipment };
}

/**
 * Cross-equipment listing for the Cleaning Records page - the same shape of
 * query as `listCleaningRecords` above, but not scoped to one asset, and
 * carrying the equipment summary each row needs since the URL no longer
 * implies it. Kept as its own function (mirroring the per-equipment one field
 * for field) rather than parameterizing a single generic implementation:
 * Prisma's generated payload types are tied to the exact `include` shape, so
 * a genuinely generic version would need its own generics for little benefit
 * over two small, independently readable functions.
 */
export async function listAllCleaningRecords(
  query: GlobalCleaningRecordListQuery,
): Promise<Paginated<GlobalCleaningRecordDto>> {
  const cleanedAtRange = toUtcDayRange(query.from, query.to);

  const where: Prisma.CleaningRecordWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.equipmentId ? { equipmentId: query.equipmentId } : {}),
    ...(query.cleanedById ? { cleanedById: query.cleanedById } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(cleanedAtRange.gte || cleanedAtRange.lte ? { cleanedAt: cleanedAtRange } : {}),
  };

  const orderBy: Prisma.CleaningRecordOrderByWithRelationInput[] = [
    { cleanedAt: "desc" },
    { id: "desc" },
  ];

  if (query.mode === "cursor" || query.cursor) {
    return listAllByCursor(where, orderBy, query.cursor, query.limit);
  }

  const [total, rows] = await prisma.$transaction([
    prisma.cleaningRecord.count({ where }),
    prisma.cleaningRecord.findMany({
      where,
      include: globalRecordInclude,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: rows.map(toGlobalDto), pagination: buildOffsetMeta(query.page, query.limit, total) };
}

async function listAllByCursor(
  where: Prisma.CleaningRecordWhereInput,
  orderBy: Prisma.CleaningRecordOrderByWithRelationInput[],
  rawCursor: string | undefined,
  limit: number,
): Promise<Paginated<GlobalCleaningRecordDto>> {
  let seek: Prisma.CleaningRecordWhereInput = {};

  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    const cleanedAt = new Date(cursor.cleanedAt);
    seek = { OR: [{ cleanedAt: { lt: cleanedAt } }, { cleanedAt, id: { lt: cursor.id } }] };
  }

  const rows = await prisma.cleaningRecord.findMany({
    where: { AND: [where, seek] },
    include: globalRecordInclude,
    orderBy,
    take: limit + 1,
  });

  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasNextPage && last ? encodeCursor({ cleanedAt: last.cleanedAt.toISOString(), id: last.id }) : null;

  return { data: page.map(toGlobalDto), pagination: buildCursorMeta(limit, nextCursor) };
}

export async function getCleaningRecord(
  equipmentId: string,
  recordId: string,
): Promise<CleaningRecordDto> {
  const row = await prisma.cleaningRecord.findUnique({ where: { id: recordId }, include: recordInclude });
  // Checking the parent as well means a record cannot be read through the wrong
  // equipment, which would otherwise leak its existence.
  if (!row || row.equipmentId !== equipmentId) throw new NotFoundError("Cleaning record", recordId);
  return toDto(row);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createCleaningRecord(
  equipmentId: string,
  input: CreateCleaningRecordInput,
  actor: UserSummaryDto,
): Promise<CleaningRecordDto> {
  const equipment = await assertEquipmentExists(equipmentId);

  if (equipment.status === "RETIRED") {
    throw new ConflictError(
      `${equipment.code} is retired; new cleaning records cannot be filed against it`,
    );
  }

  const cleanedByExists = await prisma.user.findUnique({
    where: { id: input.cleanedById },
    select: { id: true },
  });
  if (!cleanedByExists) {
    throw new ValidationError("Request body is invalid", [
      { path: "cleanedById", message: "Unknown user" },
    ]);
  }

  // The record and its audit entry are written together. A created record with
  // no audit entry is exactly the untraceable change this system exists to
  // prevent, so neither is allowed to land without the other.
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.cleaningRecord.create({
      data: {
        equipmentId,
        cleanedById: input.cleanedById,
        cleanedAt: new Date(input.cleanedAt),
        method: input.method,
        notes: input.notes ?? null,
        // `status` is not accepted from the client — a record always starts
        // PENDING and can only be moved on by a supervisor's review.
      },
      include: recordInclude,
    });

    const changes = diffFields<CleaningRecordFields>(null, created, AUDITED_CLEANING_RECORD_FIELDS);
    await writeAuditEntry(tx, {
      cleaningRecordId: created.id,
      action: "CREATE",
      changedById: actor.id,
      changes,
      reason: null,
    });

    return created;
  });

  return toDto(row);
}

export async function updateCleaningRecord(
  equipmentId: string,
  recordId: string,
  input: UpdateCleaningRecordInput,
  actor: UserSummaryDto,
): Promise<CleaningRecordDto> {
  const row = await prisma.$transaction(
    async (tx) => {
      // Read inside the transaction: the "old" values written to the audit entry
      // must be the values this update is actually replacing.
      const before = await tx.cleaningRecord.findUnique({ where: { id: recordId } });
      if (!before || before.equipmentId !== equipmentId) {
        throw new NotFoundError("Cleaning record", recordId);
      }

      const proposed = buildProposedChange(before, input, actor);
      const changes = diffFields<CleaningRecordFields>(
        before,
        proposed,
        AUDITED_CLEANING_RECORD_FIELDS,
      );

      // Nothing actually changed. Return the record unchanged and write no audit
      // entry — a trail full of "user saved the form" tells an auditor nothing.
      if (isEmptyChangeSet(changes)) {
        return tx.cleaningRecord.findUniqueOrThrow({ where: { id: recordId }, include: recordInclude });
      }

      // Amending a record that has already been signed off requires a stated
      // reason, which lives on the audit entry rather than on the record.
      if (before.status === "VERIFIED" && !input.reason) {
        throw new ValidationError("Request body is invalid", [
          {
            path: "reason",
            message: "A reason is required when amending a record that has already been verified",
          },
        ]);
      }

      const after = await tx.cleaningRecord.update({
        where: { id: recordId },
        data: proposed,
        include: recordInclude,
      });

      await writeAuditEntry(tx, {
        cleaningRecordId: recordId,
        action: "UPDATE",
        changedById: actor.id,
        changes,
        reason: input.reason ?? null,
      });

      return after;
    },
    {
      /**
       * SERIALIZABLE because this is a read-modify-write over a row whose prior
       * state is being recorded. Under the default READ COMMITTED, two
       * concurrent PATCHes could both read the same `before` and each write an
       * audit entry claiming the same old value — the trail would then be
       * quietly wrong. Postgres aborts one of them instead; the error handler
       * maps that to 409 WRITE_CONFLICT so the client can retry.
       */
      isolationLevel: "Serializable",
    },
  );

  return toDto(row);
}

/**
 * Applies the domain rules for a status transition and returns the scalar patch
 * that will be both diffed and written. Keeping this separate from the
 * transaction keeps the rules readable and independently testable.
 */
function buildProposedChange(
  before: { status: RecordStatus; cleanedById: string },
  input: UpdateCleaningRecordInput,
  actor: UserSummaryDto,
): Partial<CleaningRecordFields> {
  const proposed: Partial<CleaningRecordFields> = {};

  if (input.cleanedById !== undefined) proposed.cleanedById = input.cleanedById;
  if (input.cleanedAt !== undefined) proposed.cleanedAt = new Date(input.cleanedAt);
  if (input.method !== undefined) proposed.method = input.method;
  if (input.notes !== undefined) proposed.notes = input.notes;

  if (input.status !== undefined && input.status !== before.status) {
    if (actor.role !== "SUPERVISOR") {
      throw new ForbiddenError("Only a supervisor can change the verification status of a record");
    }

    if (input.status === "VERIFIED") {
      // Segregation of duties: the person who performed (or is recorded as
      // having performed) the cleaning cannot also sign it off.
      const cleanedById = input.cleanedById ?? before.cleanedById;
      if (cleanedById === actor.id) {
        throw new ForbiddenError(
          "You cannot verify a cleaning you are recorded as having performed",
        );
      }
      proposed.status = "VERIFIED";
      proposed.verifiedById = actor.id;
      proposed.verifiedAt = new Date();
    } else {
      // Returning a record to PENDING withdraws the sign-off, so the
      // verification metadata must be cleared with it.
      proposed.status = "PENDING";
      proposed.verifiedById = null;
      proposed.verifiedAt = null;
    }
  }

  return proposed;
}

async function writeAuditEntry(
  tx: TransactionClient,
  entry: {
    cleaningRecordId: string;
    action: "CREATE" | "UPDATE";
    changedById: string;
    changes: ChangeSet;
    reason: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      cleaningRecordId: entry.cleaningRecordId,
      action: entry.action,
      // Always the authenticated principal. There is deliberately no code path
      // that lets a request body nominate who made a change.
      changedById: entry.changedById,
      changes: entry.changes as Prisma.InputJsonValue,
      reason: entry.reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Audit history
// ---------------------------------------------------------------------------

export async function listAuditHistory(
  equipmentId: string,
  recordId: string,
  query: PaginationQuery,
): Promise<Paginated<AuditEntryDto>> {
  const record = await prisma.cleaningRecord.findUnique({
    where: { id: recordId },
    select: { id: true, equipmentId: true },
  });
  if (!record || record.equipmentId !== equipmentId) {
    throw new NotFoundError("Cleaning record", recordId);
  }

  const where = { cleaningRecordId: recordId };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { changedBy: { select: userSummarySelect } },
      // Most recent first: an auditor reads a trail backwards from "what is it
      // now" towards "how did it get here".
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  const data: AuditEntryDto[] = rows.map((row) => ({
    id: row.id,
    cleaningRecordId: row.cleaningRecordId,
    action: row.action,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
    changes: (row.changes ?? {}) as ChangeSet,
    reason: row.reason,
  }));

  return { data, pagination: buildOffsetMeta(query.page, query.limit, total) };
}
