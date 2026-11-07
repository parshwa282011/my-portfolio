import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../../../mini-proj/fulcrum",
    emptyOutDir: true,
    target: "esnext",
    chunkSizeWarningLimit: 3000,
  },
});
