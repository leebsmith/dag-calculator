import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

function surfaces() {
  return ["frontend/index.html", ...walk("frontend/src/partials", [".html"]).map(rel)];
}

const TAG = /<[a-zA-Z][^>]*>/gs;

// Selection is by role, not by a styling class: an overlay that renames its
// backdrop (the Library panel) must still be held to the dialog contract.
function dialogSurfaces() {
  return surfaces().filter((file) => read(file).includes('role="dialog"'));
}

test("every dialog is labelled, modal, and focuses itself on open", () => {
  const found = dialogSurfaces();
  assert.ok(found.length > 0, "no dialog surfaces found");
  const missing = [];
  for (const file of found) {
    const text = read(file);
    const checks = [
      ['aria-modal="true"', text.includes('aria-modal="true"')],
      ["aria-labelledby", text.includes("aria-labelledby=")],
      ['tabindex="-1"', text.includes('tabindex="-1"')],
      [
        "dialogFocus binding",
        text.includes('x-effect="dialogFocus(') || text.includes('x-init="dialogFocus('),
      ],
    ];
    for (const [name, ok] of checks) if (!ok) missing.push(`${file}: ${name}`);
  }
  assert.deepEqual(missing, [], `incomplete dialogs:\n${missing.join("\n")}`);
});

test("no modal backdrop is missing its dialog role", () => {
  const offenders = [];
  for (const file of surfaces()) {
    if (!read(file).includes('class="modal-backdrop"')) continue;
    if (!read(file).includes('role="dialog"')) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `backdrops without a dialog role:\n${offenders.join("\n")}`);
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
