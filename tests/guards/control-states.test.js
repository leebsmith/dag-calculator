import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

const STYLE_PATH = "frontend/src/style.css";
const TAG = /<[a-zA-Z][^>]*>/gs;
const STATE_CLASS = /\bis-(active|selected)\b/g;

function partials() {
  return walk("frontend/src/partials", [".html"]).map(rel);
}

test("every is-active toggle binds aria-pressed", () => {
  const missing = [];
  for (const file of partials()) {
    for (const tag of read(file).matchAll(TAG)) {
      const text = tag[0];
      if (!text.includes(":class") || !text.includes("'is-active'")) continue;
      if (!/aria-pressed/.test(text)) missing.push(file);
    }
  }
  assert.deepEqual(missing, [], `is-active without aria-pressed:\n${missing.join("\n")}`);
});

test("state classes used in markup exist in the stylesheet", () => {
  const css = read(STYLE_PATH);
  const used = new Set();
  for (const file of partials()) {
    for (const match of read(file).matchAll(STATE_CLASS)) used.add(match[0]);
  }
  const missing = [...used].filter((name) => !css.includes(`.${name}`));
  assert.deepEqual(missing, [], `state classes missing from ${STYLE_PATH}: ${missing.join(", ")}`);
});
