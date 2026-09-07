import { Router } from "express";
import {
  cleaningRecordListQuerySchema,
  createCleaningRecordSchema,
  paginationQuerySchema,
  updateCleaningRecordSchema,
  type CleaningRecordListQuery,
  type CreateCleaningRecordInput,
  type PaginationQuery,
  type UpdateCleaningRecordInput,
} from "@ecl/shared";
import { requireUser } from "../../middleware/authenticate.ts";
import { body, param, query, validateBody, validateQuery } from "../../middleware/validate.ts";
import {
  createCleaningRecord,
  getCleaningRecord,
  listAuditHistory,
  listCleaningRecords,
  updateCleaningRecord,
} from "./cleaning-record.service.ts";

// mergeParams so `:equipmentId` from the parent router is visible here.
export const cleaningRecordRouter: Router = Router({ mergeParams: true });


cleaningRecordRouter.get("/", validateQuery(cleaningRecordListQuerySchema), async (req, res) => {
  const equipmentId = param(req, "equipmentId");
  res.status(200).json(await listCleaningRecords(equipmentId, query<CleaningRecordListQuery>(req)));
});

cleaningRecordRouter.post("/", validateBody(createCleaningRecordSchema), async (req, res) => {
  const equipmentId = param(req, "equipmentId");
  const record = await createCleaningRecord(
    equipmentId,
    body<CreateCleaningRecordInput>(req),
    requireUser(req),
  );
  res.status(201).json({ data: record });
});

cleaningRecordRouter.get("/:recordId", async (req, res) => {
  const equipmentId = param(req, "equipmentId");
  res.status(200).json({ data: await getCleaningRecord(equipmentId, param(req, "recordId")) });
});

/**
 * No `requireRole` here: operators legitimately amend their own records, and
 * only the *status* transition is supervisor-only. That rule needs the record's
 * current state to evaluate, so it lives in the service rather than in a
 * route-level guard.
 */
cleaningRecordRouter.patch(
  "/:recordId",
  validateBody(updateCleaningRecordSchema),
  async (req, res) => {
    const equipmentId = param(req, "equipmentId");
    const record = await updateCleaningRecord(
      equipmentId,
      param(req, "recordId"),
      body<UpdateCleaningRecordInput>(req),
      requireUser(req),
    );
    res.status(200).json({ data: record });
  },
);

cleaningRecordRouter.get(
  "/:recordId/audit",
  validateQuery(paginationQuerySchema),
  async (req, res) => {
    const equipmentId = param(req, "equipmentId");
    res
      .status(200)
      .json(await listAuditHistory(equipmentId, param(req, "recordId"), query<PaginationQuery>(req)));
  },
);
