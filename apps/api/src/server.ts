import { buildApp } from "./app.ts";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { disconnectPrisma } from "./lib/prisma.ts";

const app = buildApp();
const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/** Finish in-flight requests and close the pool before exiting. */
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  // Do not hang forever if a connection refuses to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
