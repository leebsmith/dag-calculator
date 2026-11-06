import test from "node:test";
import assert from "node:assert/strict";

import {
  emptySectionNote,
  noBatchQuantities,
} from "../../frontend/src/views/import/emptySections.js";
import {
  estimateWhirlpoolFraction,
  hopFindings,
  hopPanes,
  otherPool,
} from "../../frontend/src/views/import/hopRouting.js";

const PAYLOAD = {
  document_type: "recipe",
  fermentables: [{ name: "Pale" }],
  hops: [{ name: "Saaz" }],
  targets: { boil_time_min: { value: 60, unit: "min" } },
};

function hop(overrides = {}) {
  return {
    line_id: "hop-1",
    section: "hops",
    name: "Saaz",
    destination: "batch.boil_hops",
    decision: "mapped",
    minutes: 60,
    quantity: { value: 100, unit: "g" },
    alpha_acid_pct: 3,
    ...overrides,
  };
}

test("a payload with no fermentables and no hops reads as empty", () => {
  assert.equal(noBatchQuantities(null), false);
  assert.equal(noBatchQuantities({ fermentables: [], hops: [] }), true);
  assert.equal(noBatchQuantities({ fermentables: [{ name: "Pale" }], hops: [] }), false);
  assert.equal(noBatchQuantities({ fermentables: [], hops: [{ name: "Saaz" }] }), false);
});

test("the empty note explains a spec sheet's per-unit quantities", () => {
  const spec = { ...PAYLOAD, document_type: "spec_sheet", fermentables: [], hops: [] };
  assert.equal(
    emptySectionNote(spec, "fermentables"),
    "none on this page: the quantities are stated per unit of production volume and sit below"
  );
  assert.equal(emptySectionNote(spec, "hops"), emptySectionNote(spec, "fermentables"));
});

test("the empty note is section-aware and falls back to one sentence", () => {
  assert.equal(emptySectionNote(null, "fermentables"), "");
  assert.equal(emptySectionNote(PAYLOAD, "unmodeled"), "nothing outside the model was captured");
  assert.equal(emptySectionNote(PAYLOAD, "fermentables"), "none on this page");
  const empty = { ...PAYLOAD, fermentables: [], hops: [] };
  assert.equal(emptySectionNote(empty, "yeasts"), "none on this page");
});

test("an explicit empty flag overrides the payload probe", () => {
  assert.equal(emptySectionNote(PAYLOAD, "fermentables", true), "none on this page");
  assert.equal(emptySectionNote(PAYLOAD, "fermentables", false), "none on this page");
});

test("a charge longer than the boil is an advisory finding", () => {
  const findings = hopFindings({
    payload: PAYLOAD,
    ledger: [hop({ minutes: 90 })],
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "HOP_LONGER_THAN_BOIL");
  assert.equal(findings[0].blocking, false);
  assert.match(findings[0].message, /Saaz is boiled 90 min but the boil is 60 min/);
});

test("a zero-minute boil charge belongs in the whirlpool", () => {
  const findings = hopFindings({ payload: PAYLOAD, ledger: [hop({ minutes: 0 })] });

  assert.deepEqual(findings.map((finding) => finding.code), ["FLAMEOUT_IN_BOIL"]);
  assert.match(findings[0].message, /zero-minute charge/);
});

test("no boil target means no routing findings", () => {
  const payload = { ...PAYLOAD, targets: {} };
  assert.deepEqual(hopFindings({ payload, ledger: [hop({ minutes: 90 })] }), []);
  assert.deepEqual(hopFindings({ payload: null, ledger: [] }), []);
});

test("routing findings ignore rows that are not mapped boil charges", () => {
  const ledger = [
    hop({ line_id: "a", decision: "ignored", minutes: 90 }),
    hop({ line_id: "b", destination: "batch.whirlpool_hops", minutes: 90 }),
  ];
  assert.deepEqual(hopFindings({ payload: PAYLOAD, ledger }), []);
});

test("the whirlpool fraction is the alpha-mass share of the mapped charges", () => {
  const ledger = [
    hop({ line_id: "boil", quantity: { value: 100, unit: "g" }, alpha_acid_pct: 10 }),
    hop({
      line_id: "wp",
      destination: "batch.whirlpool_hops",
      quantity: { value: 200, unit: "g" },
      alpha_acid_pct: 20,
    }),
  ];

  const fraction = estimateWhirlpoolFraction(ledger);
  assert.ok(Math.abs(fraction - 0.8) < 1e-9);
});

test("the whirlpool estimate is null without mapped alpha mass", () => {
  assert.equal(estimateWhirlpoolFraction([]), null);
  assert.equal(estimateWhirlpoolFraction([hop({ decision: "ignored" })]), null);
  assert.equal(
    estimateWhirlpoolFraction([hop({ quantity: { value: 100, unit: "pct" } })]),
    null
  );
});

test("the estimate ignores the dry-hop pane", () => {
  const ledger = [
    hop({ line_id: "dry", destination: "batch.dry_hops", quantity: { value: 100, unit: "g" } }),
  ];
  assert.equal(estimateWhirlpoolFraction(ledger), null);
});

test("panes group by destination and number every hop line", () => {
  const ledger = [
    hop({ line_id: "a" }),
    hop({ line_id: "b", destination: "batch.whirlpool_hops" }),
    hop({ line_id: "c", destination: null, decision: "unmapped" }),
    hop({ line_id: "d", destination: "batch.dry_hops" }),
    hop({ line_id: "e", destination: "batch.boil_hops", decision: "ignored" }),
  ];

  const panes = hopPanes(ledger);

  assert.deepEqual(panes.boil.map((row) => row.line_id), ["a", "e"]);
  assert.deepEqual(panes.whirlpool.map((row) => row.line_id), ["b"]);
  assert.deepEqual(panes.candidates.map((row) => row.line_id), ["c"]);
  assert.deepEqual(panes.dry.map((row) => row.line_id), ["d"]);
  assert.deepEqual(panes.ignored.map((row) => row.line_id), ["e"]);
  assert.equal(panes.boil[0].tag, "#1 of 5");
  assert.equal(panes.whirlpool[0].tag, "#2 of 5");
});

test("a non-hop row never enters the panes or the total", () => {
  const panes = hopPanes([hop({ section: "fermentables", line_id: "x" }), hop({ line_id: "y" })]);
  assert.equal(panes.boil.length, 1);
  assert.equal(panes.boil[0].tag, "#1 of 1");
});

test("the opposite pool never routes a dry hop", () => {
  assert.equal(otherPool("batch.boil_hops"), "batch.whirlpool_hops");
  assert.equal(otherPool("batch.whirlpool_hops"), "batch.boil_hops");
  assert.equal(otherPool("batch.dry_hops"), null);
  assert.equal(otherPool(null), null);
});
