import { Router } from "express";
import {
  createEquipmentSchema,
  equipmentListQuerySchema,
  updateEquipmentSchema,
  type CreateEquipmentInput,
  type EquipmentListQuery,
  type UpdateEquipmentInput,
} from "@ecl/shared";
import { authenticate, requireRole } from "../../middleware/authenticate.ts";
import { body, param, query, validateBody, validateQuery } from "../../middleware/validate.ts";
import { cleaningRecordRouter } from "../cleaning-records/cleaning-record.routes.ts";
import {
  createEquipment,
  deleteEquipment,
  getEquipmentById,
  listEquipment,
  updateEquipment,
} from "./equipment.service.ts";

export const equipmentRouter: Router = Router();

// Every equipment route requires a signed-in user.
equipmentRouter.use(authenticate);

equipmentRouter.get("/", validateQuery(equipmentListQuerySchema), async (req, res) => {
  res.status(200).json(await listEquipment(query<EquipmentListQuery>(req)));
});

equipmentRouter.get("/:equipmentId", async (req, res) => {
  res.status(200).json({ data: await getEquipmentById(param(req, "equipmentId")) });
});

// Managing the asset register is a supervisor responsibility; operators record
// cleanings against equipment that already exists.
equipmentRouter.post(
  "/",
  requireRole("SUPERVISOR"),
  validateBody(createEquipmentSchema),
  async (req, res) => {
    res.status(201).json({ data: await createEquipment(body<CreateEquipmentInput>(req)) });
  },
);

equipmentRouter.patch(
  "/:equipmentId",
  requireRole("SUPERVISOR"),
  validateBody(updateEquipmentSchema),
  async (req, res) => {
    res
      .status(200)
      .json({ data: await updateEquipment(param(req, "equipmentId"), body<UpdateEquipmentInput>(req)) });
  },
);

equipmentRouter.delete("/:equipmentId", requireRole("SUPERVISOR"), async (req, res) => {
  await deleteEquipment(param(req, "equipmentId"));
  res.status(204).send();
});

// Cleaning records are always addressed through their equipment, because a
// record has no meaning detached from the asset it describes.
equipmentRouter.use("/:equipmentId/cleaning-records", cleaningRecordRouter);
