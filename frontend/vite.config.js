import { defineConfig } from "vite";
import { resolve } from "node:path";
import htmlInject from "vite-plugin-html-inject";

export default defineConfig({
  plugins: [htmlInject()],
  server: {
    proxy: {
      "/solve": "http://127.0.0.1:8000",
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    rollupOptions: {
      input: {
        mwe: resolve(import.meta.dirname, "mwe.html"),
        index: resolve(import.meta.dirname, "index.html"),
      },
    },
  },
});
