// A client path the dev server does not proxy falls through to index.html, so
// the app parses HTML as JSON. The adapters are the only place API paths are
// written; every first segment they call must be a Vite proxy entry.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { read, rel, walk } from "./util.js";

const VITE = readFileSync(
  fileURLToPath(new URL("../../frontend/vite.config.js", import.meta.url)),
  "utf8"
);

function proxyPrefixes() {
  return new Set([...VITE.matchAll(/^\s*"(\/[^"]*)":/gm)].map((match) => match[1]));
}

test("every API path the adapters call is proxied in dev", () => {
  const called = new Set();
  for (const file of walk("frontend/src/adapters", [".js"]).map(rel)) {
    if (file.endsWith("apiClient.js")) continue;
    for (const match of read(file).matchAll(/[`"'](\/[a-z][a-z0-9-]*)/g)) {
      called.add(match[1]);
    }
  }

  const proxied = proxyPrefixes();
  const missing = [...called].filter((segment) => !proxied.has(segment)).sort();

  assert.deepEqual(
    missing,
    [],
    `adapter API paths without a Vite proxy:\n${missing.join("\n")}`
  );
});
