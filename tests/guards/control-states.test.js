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

test("popovers do not claim menu roles without keyboard support", () => {
  const offenders = [];
  for (const file of partials()) {
    const text = read(file);
    for (const match of text.matchAll(/role="(menu|menubar|menuitem|menuitemradio)"/g)) {
      offenders.push(`${file}: ${match[0]}`);
    }
    if (text.includes('aria-haspopup="menu"')) offenders.push(`${file}: aria-haspopup="menu"`);
  }
  assert.deepEqual(offenders, [], `menu roles without roving focus:\n${offenders.join("\n")}`);
});

test("every form label is associated with a control", () => {
  const LABEL = /<label\b[^>]*class="[^"]*\bform-label\b[^"]*"[^>]*>/gs;
  const missing = [];
  for (const file of partials()) {
    for (const tag of read(file).matchAll(LABEL)) {
      const text = tag[0];
      if (!/\bfor=/.test(text) && !text.includes(":for=")) missing.push(file);
    }
  }
  assert.deepEqual(missing, [], `form-label without for=:\n${missing.join("\n")}`);
});
