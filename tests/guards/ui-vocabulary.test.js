import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

// Retired UI class names: each was a second vocabulary for a concept the
// stylesheet already had one name for. The mapping is the replacement.
const RETIRED = [
  ["modal-drawer-title", "section-title"],
  ["step-section-title", "group-title"],
  ["step-section-header", "group-header"],
  ["brew-day-section-toggle", "section-toggle"],
  ["brew-day-section-chevron", "section-chevron"],
  ["brew-day-section-count", "section-meta"],
  ["brew-day-steps", "section-body"],
  ["grain-bill-summary", "summary-strip"],
];

const FILES = [
  "frontend/index.html",
  ...walk("frontend/src/partials", [".html"]).map(rel),
  "frontend/src/style.css",
];

test("retired UI class names stay retired", () => {
  const offenders = [];
  for (const file of FILES) {
    const text = read(file);
    for (const [retired, replacement] of RETIRED) {
      if (text.includes(retired)) offenders.push(`${file}: ${retired} -> ${replacement}`);
    }
  }
  assert.deepEqual(offenders, [], `retired class names:\n${offenders.join("\n")}`);
});
