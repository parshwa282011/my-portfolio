import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Built output is committed to mini-proj/better-desmos so GitHub Pages can
// serve it as plain static files. `base: "./"` keeps asset URLs relative.
export default defineConfig({
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../mini-proj/better-desmos", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 2500,
  },
  worker: { format: "es" },
  test: { environment: "node" },
});
