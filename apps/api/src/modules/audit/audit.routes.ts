import { Router } from "express";
import { auditListQuerySchema, type AuditListQuery } from "@ecl/shared";
import { authenticate } from "../../middleware/authenticate.ts";
import { query, validateQuery } from "../../middleware/validate.ts";
import { listGlobalAuditHistory } from "./audit.service.ts";

/**
 * The compliance-wide audit trail, mounted at `/api/audit`. Distinct from the
 * per-record history at `/api/equipment/:id/cleaning-records/:id/audit`,
 * which stays scoped to one already-known record.
 */
export const auditRouter: Router = Router();

auditRouter.use(authenticate);

auditRouter.get("/", validateQuery(auditListQuerySchema), async (req, res) => {
  res.status(200).json(await listGlobalAuditHistory(query<AuditListQuery>(req)));
});
