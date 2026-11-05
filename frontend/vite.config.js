import { defineConfig } from "vite";
import { resolve, sep } from "node:path";
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

// Partials are inlined by `vite-plugin-html-inject` at HTML transform time, so Vite
// never sees them as modules. It reloads the page when one changes, but the cached
// HTML transform still holds the old markup — which is why a new partial seemed to
// need a server restart. Drop the HTML transforms, then let Vite's own reload fetch
// them again.
function reloadPartials() {
  return {
    name: "reload-partials",
    apply: "serve",
    configureServer(server) {
      const partials = resolve(import.meta.dirname, "src/partials");
      const prefix = `${partials}${sep}`;
      server.watcher.add(partials);
      const invalidate = (file) => {
        const path = resolve(file);
        if (!path.startsWith(prefix) || !path.endsWith(".html")) return;
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.endsWith(".html")) server.moduleGraph.invalidateModule(module);
        }
        server.config.logger.info(`[partials] ${path.slice(prefix.length)} changed`);
      };
      for (const event of ["change", "add", "unlink"]) server.watcher.on(event, invalidate);
    },
  };
}

export default defineConfig({
  plugins: [htmlInject(), watchArtifact(), reloadPartials()],
  server: {
    proxy: {
      "/solve": "http://127.0.0.1:8000",
      "/batches": "http://127.0.0.1:8000",
      "/imports": "http://127.0.0.1:8000",
      "/brew-sessions": "http://127.0.0.1:8000",
      "/catalog": "http://127.0.0.1:8000",
      "/session": "http://127.0.0.1:8000",
      "/report": "http://127.0.0.1:8000",
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
