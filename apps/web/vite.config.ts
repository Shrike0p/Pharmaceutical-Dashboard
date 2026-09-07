import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The monorepo keeps a single .env at the root, so Vite reads VITE_* from
  // there rather than from a second copy inside this package.
  envDir: path.resolve(here, "../.."),
  resolve: {
    alias: { "@": path.resolve(here, "src") },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
