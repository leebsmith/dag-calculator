import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

function surfaces() {
  return ["frontend/index.html", ...walk("frontend/src/partials", [".html"]).map(rel)];
}

const TAG = /<[a-zA-Z][^>]*>/gs;

test("every modal backdrop contains a labelled dialog with focus management", () => {
  const missing = [];
  for (const file of surfaces()) {
    const text = read(file);
    if (!text.includes('class="modal-backdrop"')) continue;
    const checks = [
      ['role="dialog"', text.includes('role="dialog"')],
      ['aria-modal="true"', text.includes('aria-modal="true"')],
      ["aria-labelledby", text.includes("aria-labelledby=")],
      ['tabindex="-1"', text.includes('tabindex="-1"')],
      ["x-effect=\"dialogFocus(", text.includes('x-effect="dialogFocus(')],
    ];
    for (const [name, ok] of checks) if (!ok) missing.push(`${file}: ${name}`);
  }
  assert.deepEqual(missing, [], `incomplete dialogs:\n${missing.join("\n")}`);
});

test("static aria references resolve within the same surface and unique ids", () => {
  const problems = [];
  for (const file of surfaces()) {
    const text = read(file);
    const ids = [...text.matchAll(/(?<!:)\bid="([^"]+)"/g)].map((m) => m[1]);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    for (const id of new Set(duplicates)) problems.push(`${file}: duplicate id "${id}"`);

    for (const match of text.matchAll(/(?<!:)\baria-(?:labelledby|controls)="([^"]+)"/g)) {
      for (const id of match[1].split(/\s+/).filter(Boolean)) {
        if (!ids.includes(id)) problems.push(`${file}: aria reference to missing id "${id}"`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("every aria-controls trigger also exposes aria-expanded", () => {
  const missing = [];
  for (const file of surfaces()) {
    for (const tag of read(file).matchAll(TAG)) {
      const text = tag[0];
      if (!text.includes("aria-controls")) continue;
      if (!text.includes("aria-expanded")) missing.push(file);
    }
  }
  assert.deepEqual(missing, [], `aria-controls without aria-expanded:\n${missing.join("\n")}`);
});
