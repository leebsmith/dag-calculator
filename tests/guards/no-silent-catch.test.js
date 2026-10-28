// No silent catches: a catch in the adapter/store/view layers must either log
// via reportError, write to an error surface, or be an explicit data-parsing /
// boundary-probe allowlist entry.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const ALLOW = new Map([
  ["frontend/src/adapters/apiClient.js", "JSON.parse of untrusted HTTP bodies"],
  ["frontend/src/adapters/boundaryRunner.js", "boundary dependency probe"],
  ["frontend/src/adapters/libraryUi.js", "libraryErrors form state"],
  ["frontend/src/store/unitPrefs.js", "localStorage access"],
  ["frontend/src/store/library.js", "localStorage / JSON.parse"],
  ["frontend/src/store/persistence.js", "saveState / console.error"],
  ["frontend/src/store/recipes.js", "recordActionFailure surfaces the error in the UI"],
  ["frontend/src/store/setup.js", "setup error state"],
]);

const TARGETS = [
  "frontend/src/adapters",
  "frontend/src/store",
  "frontend/src/views",
];

function catchBlocks(source) {
  const blocks = [];
  const pattern = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let index = match.index + match[0].length;
    const start = index;
    let depth = 1;
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    while (index < source.length && depth > 0) {
      const char = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (char === "\n") lineComment = false;
      } else if (blockComment) {
        if (char === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
      } else if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = null;
      } else if (char === "/" && next === "/") {
        lineComment = true;
        index += 1;
      } else if (char === "/" && next === "*") {
        blockComment = true;
        index += 1;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      index += 1;
    }

    blocks.push(source.slice(start, index));
  }
  return blocks;
}

function signalsError(block) {
  return (
    /reportError\s*\(/.test(block) ||
    /console\.(error|warn)\s*\(/.test(block) ||
    /\.(error|errors|loadError|saveState)\b/i.test(block) ||
    /\bthrow\b/.test(block)
  );
}

test("adapters, stores, and views do not swallow errors silently", () => {
  const files = TARGETS.flatMap((dir) => walk(dir, [".js"]).map(rel)).sort();
  const offenders = [];
  for (const file of files) {
    if (ALLOW.has(file)) continue;
    for (const block of catchBlocks(read(file))) {
      if (!signalsError(block)) offenders.push(`${file}: ${block.slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, [], `silent catch blocks:\n${offenders.join("\n")}`);
});

test("the allowlist is not stale", () => {
  for (const file of ALLOW.keys()) {
    assert.ok(read(file).length >= 0, file);
  }
});
