// Phase 0 of plans/decomposition-and-display-contract.md: the frontend's module
// layers are pinned before anything moves, so a split cannot quietly invert a
// dependency. Lower ranks may not import higher ranks; the current violations
// are baselined below with a reason and fail the guard when they go stale.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT, read, rel, walk } from "./util.js";

const SRC = join(ROOT, "frontend/src");

const LAYERS = {
  data: { rank: 0, note: "seed catalogs and the artifact; nothing under src imports back" },
  styles: { rank: 0, note: "stylesheet entry points" },
  assets: { rank: 0, note: "static assets" },
  partials: { rank: 0, note: "top-level templates" },
  utils: { rank: 1, note: "utils.js barrel and utils/: pure display/model helpers" },
  engine: { rank: 2, note: "reference interpreter for the artifact; pure" },
  observability: { rank: 2, note: "error sink; leaf" },
  firebase: { rank: 2, note: "Auth-only Firebase bootstrap; leaf" },
  views: { rank: 3, note: "display model: producer field models, registries, pure view helpers" },
  ui: { rank: 4, note: "UI store primitives" },
  store: { rank: 5, note: "application state, catalogs, and persistence" },
  adapters: { rank: 6, note: "host wiring, Alpine installers, boundary clients" },
  main: { rank: 7, note: "composition root" },
};

const FILE_LAYER = {
  "utils.js": "utils",
  "observability.js": "observability",
  "firebase.js": "firebase",
  "firebaseConfig.js": "firebase",
  "main.js": "main",
};

// Store persistence reaches boundary clients directly. Deliberate until a
// client-injection seam lands; the store/adapters inversion is not part of the
// decomposition program, so the direction is recorded rather than assumed.
const ALLOW = [
  {
    file: "frontend/src/store/persistence.js",
    specifier: "../adapters/batchClient.js",
    reason: "autosave calls the batch client directly; no client seam in the store yet",
  },
  {
    file: "frontend/src/store/recipes.js",
    specifier: "../adapters/download.js",
    reason: "recipe export calls the download helper directly; no client seam in the store yet",
  },
  {
    file: "frontend/src/store/setup.js",
    specifier: "../adapters/libraryClient.js",
    reason: "library bootstrap calls the client directly; no client seam in the store yet",
  },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/.*$/gm, (match, lead) => lead + " ".repeat(match.length - lead.length));
}

function importSpecifiers(source) {
  const text = stripComments(source);
  const found = [];
  const push = (index, specifier) => {
    found.push({ specifier, line: text.slice(0, index).split("\n").length });
  };
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) push(match.index, match[1]);
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    push(match.index, match[1]);
  }
  for (const match of text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) push(match.index, match[1]);
  return found;
}

function layerOf(absPath) {
  const inSrc = relative(SRC, absPath);
  if (!inSrc.startsWith("..")) {
    const [head] = inSrc.split("/");
    const layer = inSrc.includes("/") ? head : FILE_LAYER[head];
    return layer in LAYERS ? layer : null;
  }
  const inRoot = relative(ROOT, absPath);
  const [head] = inRoot.split("/");
  return head === "data" ? "data" : null;
}

function topLevelEntries() {
  return readdirSync(SRC)
    .filter((entry) => entry !== "index.html")
    .filter((entry) => (statSync(join(SRC, entry)).isDirectory() ? true : entry.endsWith(".js")))
    .map((entry) => (statSync(join(SRC, entry)).isDirectory() ? entry : FILE_LAYER[entry] ?? entry))
    .sort();
}

function upwardImports() {
  const violations = [];
  for (const abs of walk("frontend/src", [".js"])) {
    const from = layerOf(abs);
    if (!from) continue;
    for (const { specifier, line } of importSpecifiers(read(rel(abs)))) {
      if (!specifier.startsWith(".")) continue;
      if (!/\.(js|json)$/.test(specifier)) continue;
      const to = layerOf(resolve(dirname(abs), specifier));
      if (!to) continue;
      if (LAYERS[to].rank > LAYERS[from].rank) {
        violations.push({
          file: rel(abs),
          specifier,
          line,
          from,
          to,
          key: `${rel(abs)} => ${specifier}`,
        });
      }
    }
  }
  return violations;
}

test("frontend imports only point down the layer table", () => {
  const allow = new Set(ALLOW.map((entry) => `${entry.file} => ${entry.specifier}`));
  const offenders = upwardImports().filter((violation) => !allow.has(violation.key));
  assert.deepEqual(
    offenders.map(
      (violation) =>
        `${violation.file}:${violation.line}: ${violation.specifier} (${violation.from} -> ${violation.to})`
    ),
    [],
    "Imports must point down: utils < engine < views < ui < store < adapters < main.\n" +
      "Move the shared code down a layer, or record the inversion in ALLOW with a reason."
  );
});

test("every import-direction allowlist entry is a live inversion", () => {
  const live = new Map(upwardImports().map((violation) => [violation.key, violation]));
  const failures = [];
  for (const entry of ALLOW) {
    const key = `${entry.file} => ${entry.specifier}`;
    if (!entry.reason || !entry.reason.trim()) {
      failures.push(`allowlist entry has no reason: ${key}`);
    }
    if (!live.has(key)) {
      failures.push(`stale allowlist entry, remove it: ${key}`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("every top-level frontend module sits in the layer table", () => {
  const unclassified = topLevelEntries().filter((entry) => !(entry in LAYERS));
  assert.deepEqual(
    unclassified,
    [],
    `Classify these in LAYERS before importing them:\n${unclassified.join("\n")}`
  );
});
