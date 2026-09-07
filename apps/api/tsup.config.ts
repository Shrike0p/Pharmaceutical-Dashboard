import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node24",
  platform: "node",
  clean: true,
  sourcemap: true,
  // `@ecl/shared` is a workspace package published only inside this repo, so it
  // is bundled in rather than left as a runtime import that node cannot resolve.
  noExternal: ["@ecl/shared"],
  // The Prisma client loads its query engine from disk at runtime; bundling it
  // would break that lookup, so it stays an external require from node_modules.
  external: ["@prisma/client", "@prisma/adapter-pg", "pg"],
});
