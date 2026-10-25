import { defineConfig } from "vite";
import { resolve } from "node:path";
import htmlInject from "vite-plugin-html-inject";

// `data/artifact.json` is imported through a symlink inside the root, so Vite's
// watcher does not reliably see edits to the real file. Watch it explicitly and
// force a full reload — otherwise a long-running dev server keeps serving the
// previous artifact and the engine rejects stale defaults.
function watchArtifact() {
  return {
    name: "watch-artifact-json",
    configureServer(server) {
      const artifact = resolve(import.meta.dirname, "../data/artifact.json");
      server.watcher.add(artifact);
      server.watcher.on("change", (file) => {
        if (resolve(file) !== artifact) return;
        server.config.logger.info("[artifact] data/artifact.json changed; reloading");
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export default defineConfig({
  plugins: [htmlInject(), watchArtifact()],
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
