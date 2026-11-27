// Every structural stylesheet must reach the browser. The role split moved the
// rules out of one sheet; a file written but never linked is invisible to the
// CSS guards (they read from disk) and to the build (Vite bundles only what the
// document references), so this guard compares the links to the directory.

import test from "node:test";
import assert from "node:assert/strict";

import { ROOT, existsSync, join, read, rel, walk } from "./util.js";

const INDEX = "frontend/index.html";
const STYLES = "frontend/src/styles";
const TOKENS = "/styles/tokens/";

function links() {
  return [...read(INDEX).matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(
    (match) => match[1]
  );
}

function sheets() {
  return walk(STYLES, [".css"]).map((absolute) => {
    const path = rel(absolute);
    return path.replace(/^frontend/, "");
  });
}

test("every structural stylesheet is linked, and only those", () => {
  const linked = links();
  const declared = sheets();

  assert.deepEqual(
    [...new Set(linked)].sort(),
    [...declared].sort(),
    "index.html stylesheet links and styles/ disagree"
  );
  assert.equal(new Set(linked).size, linked.length, "a stylesheet is linked twice");
});

test("every linked stylesheet exists", () => {
  const missing = links().filter(
    (href) => !existsSync(join(ROOT, "frontend", href.replace(/^\//, "")))
  );
  assert.deepEqual(missing, []);
});

test("tokens load before every role sheet", () => {
  const linked = links();
  const lastToken = Math.max(...linked.map((href, index) => (href.includes(TOKENS) ? index : -1)));
  const firstRole = linked.findIndex((href) => !href.includes(TOKENS));
  assert.ok(lastToken >= 0, "no token sheet is linked");
  assert.ok(firstRole > lastToken, "a role sheet loads before the tokens");
});
