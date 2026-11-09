import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

// Retired UI class names: each was a second vocabulary for a concept the
// stylesheet already had one name for. The mapping is the replacement.
const RETIRED = [
  ["modal-drawer-title", "region-title"],
  ["step-section-title", "group-title"],
  ["step-section-header", "group-header"],
  ["brew-day-section-toggle", "section-toggle"],
  ["brew-day-section-chevron", "section-chevron"],
  ["brew-day-section-count", "section-meta"],
  ["brew-day-steps", "section-body"],
  ["grain-bill-summary", "summary-strip"],
  ["step-card", "card"],
  ["step-card-header", "card-header"],
  ["step-card-content", "card-body"],
  ["library-panel", "sheet--library"],
  ["signin-panel", "sheet--signin"],
  ["library-overlay", "sheet-overlay"],
  ["synthesized-card", "card-section"],
  ["synthesized-header", "card-section-header"],
  ["synthesized-actions", "card-section-actions"],
  ["synthesized-title", "eyebrow"],
  ["library-section", "region--divided"],
  ["landing-imports", "region"],
  ["step-group", "region"],
  ["map-section", "region--spaced"],
  ["section-title", "region-title"],
  ["library-heading", "region-title"],
  ["import-section-title", "pane-title"],
  ["table-empty-cell", "empty-state"],
  ["catalog-drawer-content", "catalog-pane-content"],
  ["catalog-drawer-controls", "catalog-pane-controls"],
  ["catalog-drawer-list", "catalog-pane-list"],
  ["catalog-drawer-breadcrumb", "catalog-pane-breadcrumb"],
];

const FILES = [
  "frontend/index.html",
  ...walk("frontend/src/partials", [".html"]).map(rel),
  "frontend/src/style.css",
];

function classTokens(file, text) {
  const tokens = new Set();
  if (file.endsWith(".css")) {
    for (const match of text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) tokens.add(match[1]);
  } else {
    for (const match of text.matchAll(/(?<![\w:-])class="([^"]*)"/g)) {
      for (const token of match[1].split(/\s+/)) {
        if (token && !/[{}:$]/.test(token)) tokens.add(token);
      }
    }
  }
  return tokens;
}

test("retired UI class names stay retired", () => {
  const offenders = [];
  for (const file of FILES) {
    const tokens = classTokens(file, read(file));
    for (const [retired, replacement] of RETIRED) {
      if (tokens.has(retired)) offenders.push(`${file}: ${retired} -> ${replacement}`);
    }
  }
  assert.deepEqual(offenders, [], `retired class names:\n${offenders.join("\n")}`);
});
