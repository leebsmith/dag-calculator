import test from "node:test";
import assert from "node:assert/strict";

import {
  gristDraftTotalsLabel,
  gristTotalParts,
  gristTotalPct,
  gristValidationState,
  isMaltAtLimit,
  isTraceMalt,
  MALT_ROW_LIMIT,
  maltFermentableLabel,
  sortGristRows,
} from "../../frontend/src/views/producer/gristRows.js";

test("sortGristRows orders by parts then name, case-insensitively", () => {
  const rows = [
    { name: "b", parts: 10 },
    { name: "A", parts: 30 },
    { name: "a", parts: 10 },
    { name: "c" },
  ];

  assert.deepEqual(sortGristRows(rows).map((row) => row.name), ["A", "a", "b", "c"]);
  assert.deepEqual(rows.map((row) => row.name), ["b", "A", "a", "c"]);
});

test("isTraceMalt marks rows under two percent", () => {
  assert.equal(isTraceMalt({ pct: 0.019 }), true);
  assert.equal(isTraceMalt({ pct: 0.02 }), false);
  assert.equal(isTraceMalt({}), true);
});

test("maltFermentableLabel carries the provenance marker", () => {
  assert.equal(
    maltFermentableLabel({
      fermentability_fraction: 0.62,
      fermentability_provenance: { kind: "prior" },
      fermentability_basis: "real",
    }),
    "~62.0%"
  );
  assert.equal(
    maltFermentableLabel({
      fermentability_fraction: 0.78,
      fermentability_provenance: { bound: "min" },
      fermentability_basis: "apparent",
    }),
    "≥≈78.0%"
  );
  assert.equal(maltFermentableLabel({}), "");
  assert.equal(maltFermentableLabel(undefined), "");
});

test("grist totals sum parts and percent tolerantly", () => {
  const rows = [{ parts: 80, pct: 0.8 }, { parts: "20", pct: 0.2 }, { parts: "x", pct: 0 }];

  assert.equal(gristTotalParts(rows), 100);
  assert.equal(gristTotalPct(rows), 1);
  assert.equal(gristTotalParts([]), 0);
  assert.equal(gristDraftTotalsLabel(100, 1), "100.0 parts · 100.0%");
});

test("gristValidationState reports unconfigured, deficit, balanced, and surplus", () => {
  assert.deepEqual(gristValidationState(0), {
    type: "unconfigured",
    label: "Unconfigured",
    class: "badge-muted",
  });
  assert.deepEqual(gristValidationState(0.6), {
    type: "deficit",
    label: "60.0% (Remaining 40.0%)",
    class: "badge-amber",
  });
  assert.deepEqual(gristValidationState(1), {
    type: "balanced",
    label: "100.0% Balanced",
    class: "badge-success",
  });
  assert.deepEqual(gristValidationState(1.1), {
    type: "surplus",
    label: "110.0% (Excess +10.0%)",
    class: "badge-danger",
  });
});

test("isMaltAtLimit trips at the row limit, not before", () => {
  assert.equal(isMaltAtLimit(MALT_ROW_LIMIT - 1), false);
  assert.equal(isMaltAtLimit(MALT_ROW_LIMIT), true);
});
