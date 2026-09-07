import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env automatically. The whole monorepo shares a
// single .env at the repository root so there is exactly one file to fill in.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env"), quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    // Used by `prisma db seed`. Note that Prisma 7's `migrate reset` no longer
    // runs this automatically the way Prisma 6 did, so the `db:reset` script
    // chains `prisma db seed` explicitly rather than relying on it.
    seed: "tsx prisma/seed.ts",
  },
});
