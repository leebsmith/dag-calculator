// One derivation for every surface: a partial may read a row's state from
// `rowState(row)` and nothing else. Composing decision/ref checks in markup is how
// two screens came to disagree about whether a line was decided; this is the guard
// that stops it recurring.

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const FILES = [
  "frontend/index.html",
  ...walk("frontend/src/partials", [".html"]).map(rel),
];

const FORBIDDEN = [
  { pattern: /\brow\.decision\b/, why: "read rowState(row).state" },
  { pattern: /\brow\.ref\b/, why: "read rowState(row).ref / .picked" },
  { pattern: /\bisDangling\(/, why: "a broken pick is rowState(row).state === 'broken'" },
];

test("templates read a row's state from one derivation", () => {
  const offenders = [];
  for (const file of FILES) {
    const html = read(file);
    for (const { pattern, why } of FORBIDDEN) {
      for (const match of html.matchAll(new RegExp(pattern, "g"))) {
        const line = html.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line} ${match[0]} — ${why}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `state read outside rowState:\n${offenders.join("\n")}`);
});

test("the import map actually binds the derivation", () => {
  const map = read("frontend/src/partials/import-map.html");
  assert.match(map, /rowState\(row\)/, "the guard reads the surface it protects");
  assert.match(map, /rowState\(row\)\.message|rowIssue\(row\)/, "and shows the sentence it derives");
});
