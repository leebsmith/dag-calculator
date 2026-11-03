import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRef,
  buildLedger,
  gravityPointsToSg,
  ignoreRow,
  isResolved,
  ledgerCounts,
  massKg,
  screenCandidates,
  setDestination,
  shares,
  unresolvedRows,
} from "../../frontend/src/views/import/ledger.js";

const PAYLOAD = {
  targets: {
    og: { value: 1.078, unit: "sg", verbatim: "OG: 1.078", page: 1 },
  },
  fermentables: [
    { name: "Maris Otter", quantity: { value: 10, unit: "lb" }, kind_hint: "malt", verbatim: "10 lb Maris Otter", page: 1 },
    { name: "Munich", quantity: { value: 1, unit: "lb" }, kind_hint: "malt", verbatim: "1 lb Munich", page: 1 },
    { name: "Carafa Special III", quantity: { value: 1, unit: "lb" }, kind_hint: "malt", verbatim: "1 lb Carafa", page: 1 },
    { name: "D-180 Candi Syrup", quantity: { value: 8, unit: "oz" }, kind_hint: "sugar", verbatim: "8 oz D-180", page: 1 },
  ],
  hops: [
    { name: "Citra", quantity: { value: 1.5, unit: "oz" }, stage_guess: "boil", minutes: 20, ibu_contribution: 25, verbatim: "Citra 20 min", page: 1 },
    { name: "Amarillo", quantity: { value: 1, unit: "oz" }, stage_guess: "whirlpool", ibu_contribution: 7, verbatim: "Amarillo whirlpool", page: 1 },
    { name: "Citra", quantity: { value: 1, unit: "oz" }, stage_guess: "dry_hop", verbatim: "Citra dry hop", page: 2 },
    { name: "Mystery", quantity: { value: 1, unit: "g" }, stage_guess: "unknown", verbatim: "Mystery hop", page: 2 },
  ],
  yeasts: [{ name: "British Ale", lab: "Wyeast", code: "1098", verbatim: "Wyeast 1098", page: 1 }],
  mashes: [{ step_verbatim: "60 min at 152F", temperature: { value: 152, unit: "f" }, duration_min: 60, page: 2 }],
  unmodeled: [{ text: "1 tsp Irish moss", kind: "process_additive", stage: "15 min", quantity: { value: 1, unit: "tsp" }, page: 2 }],
  warnings: [],
};

test("every transcribed line becomes one ledger row", () => {
  const ledger = buildLedger(PAYLOAD);
  assert.deepEqual(
    ledger.map((row) => row.line_id),
    [
      "fermentables[0]",
      "fermentables[1]",
      "fermentables[2]",
      "fermentables[3]",
      "hops[0]",
      "hops[1]",
      "hops[2]",
      "hops[3]",
      "yeasts[0]",
      "mashes[0]",
      "unmodeled[0]",
    ]
  );
});

test("destinations are proposed from what the page prints", () => {
  const byLine = Object.fromEntries(buildLedger(PAYLOAD).map((row) => [row.line_id, row]));
  assert.equal(byLine["fermentables[0]"].destination, "grist.major_malts");
  assert.equal(byLine["fermentables[3]"].destination, "batch.sugars");
  assert.equal(byLine["hops[0]"].destination, "batch.boil_hops");
  assert.equal(byLine["hops[1]"].destination, "batch.whirlpool_hops");
  assert.equal(byLine["hops[2]"].destination, "batch.dry_hops");
  assert.equal(byLine["hops[3]"].destination, null, "an unknown stage is the user's call");
});

test("a small share is proposed as a trace malt, and is reversible", () => {
  const ledger = buildLedger(PAYLOAD, { traceThresholdPct: 15 });
  const carafa = ledger.find((row) => row.name === "Carafa Special III");
  assert.equal(carafa.destination, "grist.trace_malts");
  const moved = setDestination(carafa, "grist.major_malts");
  assert.equal(moved.destination, "grist.major_malts");
  assert.equal(moved.decision, "unresolved", "a proposal is not a decision");
});

test("mass is converted through the artifact's factors, never hardcoded", () => {
  assert.equal(massKg({ value: 1, unit: "lb" }), 0.45359237);
  assert.equal(massKg({ value: 1000, unit: "g" }), 1);
  assert.equal(massKg({ value: 50, unit: "pct" }), null);
  assert.equal(massKg(null), null);
});

test("choosing a catalog item keeps a same-family destination", () => {
  const ledger = buildLedger(PAYLOAD);
  const hop = ledger.find((row) => row.line_id === "hops[1]");
  const mappedHop = applyRef(hop, { id: "citra" }, "hop");
  assert.equal(mappedHop.destination, "batch.whirlpool_hops", "a hop pick must not move the pool");
  const row = ledger.find((candidate) => candidate.name === "Maris Otter");
  const mapped = applyRef(row, { id: "std:pale-ale-malt" }, "malt");
  assert.equal(mapped.ref, "std:pale-ale-malt");
  assert.equal(mapped.destination, "grist.major_malts");
  assert.equal(mapped.decision, "mapped");
  assert.equal(isResolved(mapped), true);
});

test("an ignored row needs a reason, and gets one by default", () => {
  const row = buildLedger(PAYLOAD).find((candidate) => candidate.section === "hops");
  const ignored = ignoreRow(row);
  assert.equal(ignored.decision, "ignored");
  assert.equal(ignored.reason, "not modelled");
  assert.equal(isResolved(ignored), true);
  assert.equal(isResolved({ ...ignored, reason: "  " }), false, "a blank reason is not a reason");
});

test("the counts say what is left", () => {
  const ledger = buildLedger(PAYLOAD);
  const counts = ledgerCounts(ledger);
  assert.equal(counts.total, ledger.length);
  assert.equal(counts.unresolved, ledger.length - 1, "only the unmodelled line is decided");
  assert.equal(counts.bySection.unmodeled.resolved, 1);
  assert.equal(unresolvedRows(ledger).length, counts.unresolved);
});

test("shares are parts per collection, normalised within the pool", () => {
  const ledger = buildLedger(PAYLOAD)
    .map((row) => {
      if (row.section === "fermentables" && row.kind_hint !== "sugar") {
        return applyRef(row, { id: `id-${row.name}` }, "malt");
      }
      if (row.section === "hops" && row.destination) {
        return applyRef(row, { id: `hop-${row.name}` }, "hop");
      }
      return row;
    });
  const out = shares(ledger);
  const grist = out["grist.major_malts"];
  assert.equal(grist.length, 3);
  const total = grist.reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `the bill sums to 1, got ${total}`);
  assert.ok(grist[0].pct > grist[1].pct, "Maris Otter dominates the bill");
  assert.equal(out["batch.boil_hops"].length, 1);
  assert.equal(out["batch.whirlpool_hops"].length, 1);
  assert.equal(out["batch.whirlpool_hops"][0].pct, 1, "one charge is the whole pool");
});

test("gravity points become a specific gravity, once", () => {
  assert.equal(gravityPointsToSg({ value: 1110, unit: "points" }), 1.11);
  assert.equal(gravityPointsToSg({ value: 1.078, unit: "sg" }), 1.078);
  assert.equal(gravityPointsToSg({ value: 13.5, unit: "plato" }), null, "Plato needs the engine");
  assert.equal(gravityPointsToSg(null), null);
});

test("the screen ranks candidates and never invents one", () => {
  const malts = [
    { id: "abbey", name: "Abbey Malt (Biscuit Malt)", standard_name: "Biscuit Malt", maltster: "Weyermann", notes: "" },
    { id: "best-biscuit", name: "BEST Biscuit", standard_name: "Biscuit Malt", maltster: "Bestmalz", notes: "" },
    { id: "pale", name: "Pale Ale Malt", standard_name: "Pale Ale Malt", maltster: "Crisp", notes: "" },
  ];
  const ranked = screenCandidates("Abbey Malt", malts, "malt");
  assert.equal(ranked[0].id, "abbey");
  assert.ok(ranked.length <= 5);
  assert.deepEqual(screenCandidates("no such malt", [], "malt"), []);
});
