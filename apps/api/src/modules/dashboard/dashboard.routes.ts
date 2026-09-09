import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.ts";
import { getDashboardStats } from "./dashboard.service.ts";

export const dashboardRouter: Router = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get("/stats", async (_req, res) => {
  res.status(200).json({ data: await getDashboardStats() });
});
