import { pino } from "pino";
import { env } from "../config/env.ts";

export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  // Human-readable in development, structured JSON in production.
  transport: env.isProduction || env.isTest ? undefined : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash", "*.token"],
    censor: "[redacted]",
  },
});
