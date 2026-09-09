import { Router } from "express";
import {
  globalCleaningRecordListQuerySchema,
  type GlobalCleaningRecordListQuery,
} from "@ecl/shared";
import { authenticate } from "../../middleware/authenticate.ts";
import { query, validateQuery } from "../../middleware/validate.ts";
import { listAllCleaningRecords } from "./cleaning-record.service.ts";

/**
 * Cross-equipment records, mounted at `/api/cleaning-records`. The
 * per-equipment `cleaningRecordRouter` in `cleaning-record.routes.ts` stays
 * the place for anything scoped to one asset (create, update, its own audit
 * history); this router exists only for the "show me every record" views -
 * the Cleaning Records page, and the command palette's cross-asset search.
 */
export const globalCleaningRecordRouter: Router = Router();

globalCleaningRecordRouter.use(authenticate);

globalCleaningRecordRouter.get(
  "/",
  validateQuery(globalCleaningRecordListQuerySchema),
  async (req, res) => {
    res.status(200).json(await listAllCleaningRecords(query<GlobalCleaningRecordListQuery>(req)));
  },
);
