// Every hop in the catalogue must carry an alpha acid figure. The engine skips a
// boundary whose inputs hold a null, so a hop without alpha does not report
// "unknown" — it silently disables the IBU solve for any batch that selects it.
// Absent is therefore not a legal state for this field, and the catalogue is
// permanently mixed rather than uniform: the tail keeps a crowd figure and says
// so in its provenance.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

const hops = () => Object.values(JSON.parse(read("data/seeds/hops.json")));

test("every hop carries an alpha acid fraction the solver can read", () => {
  const offenders = [];
  for (const hop of hops()) {
    const alpha = hop.alpha_acid_pct;
    if (typeof alpha !== "number" || !Number.isFinite(alpha)) {
      offenders.push(`${hop.id}: ${JSON.stringify(alpha)}`);
      continue;
    }
    if (alpha <= 0 || alpha > 1) offenders.push(`${hop.id}: ${alpha}`);
  }
  assert.deepEqual(offenders, [], "a hop without alpha disables the IBU solve rather than reporting unknown");
});

test("alpha bounds, where present, bracket the value", () => {
  const offenders = [];
  for (const hop of hops()) {
    const { alpha_acid_min_pct: min, alpha_acid_max_pct: max, alpha_acid_pct: value } = hop;
    if (min === undefined || max === undefined) continue;
    if (min > max) offenders.push(`${hop.id}: min ${min} > max ${max}`);
    if (value < min || value > max) offenders.push(`${hop.id}: ${value} outside ${min}–${max}`);
  }
  assert.deepEqual(offenders, [], "a stored centre must sit inside its published bounds");
});
