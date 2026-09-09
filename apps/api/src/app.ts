import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { prisma } from "./lib/prisma.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { auditRouter } from "./modules/audit/audit.routes.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { globalCleaningRecordRouter } from "./modules/cleaning-records/global-cleaning-record.routes.ts";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.ts";
import { equipmentRouter } from "./modules/equipment/equipment.routes.ts";

/**
 * Builds the app without starting a listener, so the integration tests can
 * drive it in-process through supertest instead of binding a port.
 */
export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  if (!env.isTest) {
    app.use(pinoHttp({ logger }));
  }

  app.get("/api/health", async (_req, res) => {
    // Reports the dependency, not just the process: a health check that answers
    // "yes" while the database is unreachable is worse than none.
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/equipment", equipmentRouter);
  app.use("/api/cleaning-records", globalCleaningRecordRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
