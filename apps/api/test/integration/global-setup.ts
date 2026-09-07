import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.resolve(apiRoot, "../../.env"), quiet: true });

/**
 * Brings the test database up to the current schema once per run, so the suite
 * works from a clean checkout without a manual migration step.
 *
 * `migrate deploy` rather than `migrate dev`: it applies committed migrations
 * only, and never prompts or attempts to author a new one.
 */
export default function setup(): void {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env and create the test database:\n" +
        "  createdb equipment_cleaning_log_test",
    );
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
