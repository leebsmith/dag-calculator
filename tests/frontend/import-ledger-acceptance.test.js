import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyRef,
  buildLedger,
  isResolved,
  ledgerCounts,
  shares,
  unresolvedRows,
} from "../../frontend/src/views/import/ledger.js";

// The capstone the plan asked for: the captured pristine recipe, through the
// ledger, to the shares a batch would be built from. No engine, no network.

const FIXTURE = new URL("../backend/fixtures/llm/pristine-black-ipa/response.json", import.meta.url);

function payload() {
  const body = JSON.parse(readFileSync(FIXTURE, "utf8"));
  return JSON.parse(body.candidates[0].content.parts[0].text);
}

function mapEverything(ledger) {
  return ledger.map((row) => {
    if (row.section === "fermentables") {
      const kind = row.kind_hint === "sugar" || row.kind_hint === "extract" ? "sugar" : "malt";
      return applyRef(row, { id: `ref-${row.name}` }, kind);
    }
    if (row.section === "hops") return applyRef(row, { id: `hop-${row.name}` }, "hop");
    if (row.section === "yeasts") return applyRef(row, { id: "wyeast-1098" }, "yeast");
    if (row.section === "mashes") return applyRef(row, { id: "alpha_amylase" }, "mash");
    return row;
  });
}

test("the pristine recipe becomes a decidable ledger", () => {
  const ledger = buildLedger(payload());
  const counts = ledgerCounts(ledger);
  assert.equal(counts.total, 6 + 8 + 1 + 1 + 5, "six malts, eight hops, yeast, mash, five remarks");
  assert.equal(counts.unresolved, counts.total - 5, "only the unmodelled lines start decided");
});

test("hops land in the three places the model actually has", () => {
  const ledger = buildLedger(payload());
  const byDestination = (id) => ledger.filter((row) => row.destination === id).length;
  assert.equal(byDestination("batch.boil_hops"), 2);
  assert.equal(byDestination("batch.whirlpool_hops"), 2);
  assert.equal(byDestination("batch.dry_hops"), 4);
});

test("a fully mapped recipe leaves nothing unresolved", () => {
  const mapped = mapEverything(buildLedger(payload()));
  assert.deepEqual(unresolvedRows(mapped), []);
  assert.ok(mapped.every((row) => isResolved(row)));
});

test("the grist normalises to exactly one bill, and the pools stay separate", () => {
  const out = shares(mapEverything(buildLedger(payload())));
  const grist = out["grist.major_malts"];
  assert.equal(grist.length, 6);
  const total = grist.reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `the bill sums to 1, got ${total}`);

  assert.equal(out["batch.boil_hops"].length, 2);
  assert.equal(out["batch.whirlpool_hops"].length, 2);
  const whirlpool = out["batch.whirlpool_hops"].reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(whirlpool - 1) < 1e-9, "each pool is normalised on its own");
});
