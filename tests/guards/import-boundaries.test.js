// R3: the frontend dependency direction is one-way.
//
//   engine/   imports nothing above it
//   views/    may import engine/ and utils/, never store/ or adapters/
//   store/    may import views/ and engine/, never adapters/
//   utils/    is a leaf: it imports only utils/
//
// Root modules (observability, ui/, data seeds) are shared infrastructure and
// stay importable by every layer; `main.js` is the shell and no layer may import
// it.

import test from "node:test";
import assert from "node:assert/strict";
import { posix } from "node:path";

import { read, rel, walk } from "./util.js";

const LAYERS = new Set(["engine", "views", "store", "adapters", "utils"]);
const SHELL = "frontend/src/main.js";

const FORBIDDEN = {
  engine: new Set(["views", "store", "adapters"]),
  views: new Set(["store", "adapters"]),
  store: new Set(["adapters"]),
  utils: new Set(["engine", "views", "store", "adapters", "other"]),
};

function layerOf(file) {
  const relative = file.replace(/^frontend\/src\//, "");
  const [head] = relative.split("/");
  return LAYERS.has(head) ? head : "other";
}

function specifiers(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

function resolve(from, spec) {
  if (!spec.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(from), spec));
}

test("R3: no layer imports a layer above it", () => {
  const offenders = [];

  for (const absolute of walk("frontend/src", [".js"])) {
    const file = rel(absolute);
    const importer = layerOf(file);
    const forbidden = FORBIDDEN[importer];
    if (!forbidden) continue;

    for (const spec of specifiers(read(file))) {
      const target = resolve(file, spec);
      if (!target) continue;
      if (target === SHELL) {
        offenders.push(`${file} imports the shell (${spec})`);
        continue;
      }
      const imported = layerOf(target);
      if (forbidden.has(imported)) {
        offenders.push(`${file} (${importer}) imports ${imported}/ (${spec})`);
      }
    }
  }

  assert.deepEqual(offenders, [], `dependency direction violations:\n${offenders.join("\n")}`);
});
