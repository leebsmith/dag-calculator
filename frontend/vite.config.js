import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        mwe: resolve(import.meta.dirname, "mwe.html"),
        index: resolve(import.meta.dirname, "index.html"),
      },
    },
  },
});
