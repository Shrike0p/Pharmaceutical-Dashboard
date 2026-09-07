import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

/**
 * The whole monorepo shares one .env at the repository root, so there is a
 * single file to fill in. Walk up to find it rather than hard-coding a depth,
 * because the path differs between `tsx src/server.ts` and `node dist/server.js`.
 */
function findEnvFile(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envFile = findEnvFile();
if (envFile) loadEnv({ path: envFile, quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — generate one with `openssl rand -base64 48`"),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail at boot with a readable message rather than at the first request.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}\n`);
  console.error(`Checked env file: ${envFile ?? "<none found>"}`);
  process.exit(1);
}

const raw = parsed.data;

/**
 * The integration suite runs against a separate database that it truncates
 * between tests. Routing that through here means no test can accidentally
 * point at the development database.
 */
const databaseUrl =
  raw.NODE_ENV === "test" && raw.TEST_DATABASE_URL ? raw.TEST_DATABASE_URL : raw.DATABASE_URL;

export const env = {
  ...raw,
  DATABASE_URL: databaseUrl,
  corsOrigins: raw.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
} as const;

export type Env = typeof env;
