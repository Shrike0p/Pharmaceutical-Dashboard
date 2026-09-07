import type {
  CreateEquipmentInput,
  EquipmentDto,
  EquipmentListQuery,
  Paginated,
  UpdateEquipmentInput,
} from "@ecl/shared";
import { prisma } from "../../lib/prisma.ts";
import { ConflictError, NotFoundError } from "../../errors/app-error.ts";
import { buildOffsetMeta } from "../../domain/pagination/cursor.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const equipmentInclude = {
  _count: { select: { cleaningRecords: true } },
  cleaningRecords: {
    orderBy: { cleanedAt: "desc" },
    take: 1,
    select: { cleanedAt: true },
  },
} satisfies Prisma.EquipmentInclude;

type EquipmentRow = Prisma.EquipmentGetPayload<{ include: typeof equipmentInclude }>;

function toDto(row: EquipmentRow): EquipmentDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    cleaningRecordCount: row._count.cleaningRecords,
    lastCleanedAt: row.cleaningRecords[0]?.cleanedAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEquipment(query: EquipmentListQuery): Promise<Paginated<EquipmentDto>> {
  const where: Prisma.EquipmentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // One round trip for the page and its count, so the two cannot disagree by
  // more than the usual read skew.
  const [total, rows] = await prisma.$transaction([
    prisma.equipment.count({ where }),
    prisma.equipment.findMany({
      where,
      include: equipmentInclude,
      orderBy: [{ code: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data: rows.map(toDto), pagination: buildOffsetMeta(query.page, query.limit, total) };
}

export async function getEquipmentById(id: string): Promise<EquipmentDto> {
  const row = await prisma.equipment.findUnique({ where: { id }, include: equipmentInclude });
  if (!row) throw new NotFoundError("Equipment", id);
  return toDto(row);
}

export async function createEquipment(input: CreateEquipmentInput): Promise<EquipmentDto> {
  // A duplicate code surfaces as Prisma P2002 and is mapped to a 409 by the
  // error handler, so there is no read-then-write race to lose here.
  const row = await prisma.equipment.create({ data: input, include: equipmentInclude });
  return toDto(row);
}

export async function updateEquipment(id: string, input: UpdateEquipmentInput): Promise<EquipmentDto> {
  const existing = await prisma.equipment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Equipment", id);

  const row = await prisma.equipment.update({ where: { id }, data: input, include: equipmentInclude });
  return toDto(row);
}

/**
 * Deletes equipment, but only while it has no cleaning history.
 *
 * Cleaning records are evidence that a piece of equipment was fit for the next
 * batch. Deleting the asset to tidy up a list must not take that evidence with
 * it, so once history exists the correct action is to retire the equipment
 * instead. The database enforces the same rule via `onDelete: Restrict`; this
 * check exists to turn that into a useful message rather than a raw FK error.
 */
export async function deleteEquipment(id: string): Promise<void> {
  const existing = await prisma.equipment.findUnique({
    where: { id },
    include: { _count: { select: { cleaningRecords: true } } },
  });
  if (!existing) throw new NotFoundError("Equipment", id);

  if (existing._count.cleaningRecords > 0) {
    throw new ConflictError(
      `${existing.code} has ${existing._count.cleaningRecords} cleaning record(s) and cannot be deleted. ` +
        `Retire it instead: PATCH /api/equipment/${id} { "status": "RETIRED" }`,
    );
  }

  await prisma.equipment.delete({ where: { id } });
}

/** Shared by the cleaning-record module to validate the :equipmentId segment. */
export async function assertEquipmentExists(id: string) {
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { id: true, code: true, status: true },
  });
  if (!equipment) throw new NotFoundError("Equipment", id);
  return equipment;
}
