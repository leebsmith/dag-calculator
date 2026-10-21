import { defineConfig } from "vite";
import { resolve } from "node:path";
import htmlInject from "vite-plugin-html-inject";

export default defineConfig({
  plugins: [htmlInject()],
  server: {
    proxy: {
      "/solve": "http://127.0.0.1:8000",
      "/batches": "http://127.0.0.1:8000",
      "/catalog": "http://127.0.0.1:8000",
      "/session": "http://127.0.0.1:8000",
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
      },
    },
  },
});
