import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  projectImport,
  volumeL,
  whirlpoolFraction,
} from "../../frontend/src/adapters/importProjection.js";
import { applyRef, buildLedger } from "../../frontend/src/views/import/ledger.js";

// The pristine capture again, now all the way to the state a gate would solve.

const FIXTURE = new URL("../backend/fixtures/llm/pristine-black-ipa/response.json", import.meta.url);

function payload() {
  const body = JSON.parse(readFileSync(FIXTURE, "utf8"));
  return JSON.parse(body.candidates[0].content.parts[0].text);
}

const CATALOG = {
  malt: {
    "m-otter": { id: "m-otter", name: "Maris Otter", category: "BASE", yield_fraction: 0.8 },
    "m-munich": { id: "m-munich", name: "Munich", category: "BASE", yield_fraction: 0.78 },
  },
  hop: {
    "h-citra": { id: "h-citra", name: "Citra", alpha_acid_pct: 0.12, product_form: "t90_pellet" },
    "h-amarillo": { id: "h-amarillo", name: "Amarillo", alpha_acid_pct: 0.09 },
  },
  yeast: { "y-1098": { id: "y-1098", name: "British Ale", attenuation_pct: 0.74 } },
  sugar: {},
};

function catalog(kind, id) {
  return CATALOG[kind]?.[id] ?? null;
}

function mapped() {
  return buildLedger(payload()).map((row) => {
    if (row.section === "fermentables") {
      const ref = row.name === "Maris Otter" ? "m-otter" : "m-munich";
      return applyRef(row, { id: ref }, "malt");
    }
    if (row.section === "hops") {
      return applyRef(row, { id: row.name === "Citra" ? "h-citra" : "h-amarillo" }, "hop");
    }
    if (row.section === "yeasts") return applyRef(row, { id: "y-1098" }, "yeast");
    return row;
  });
}

test("the roots are the targets the source stated, in base units", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  assert.equal(state.roots["batch.target_og"], 1.078);
  assert.equal(state.roots["batch.target_ibu"], 60);
  assert.ok(Math.abs(state.roots["batch.v_ferm"] - 18.927) < 0.01, "5 gal in litres");
  assert.equal(state.roots["batch.boil_time_min"], 60);
});

test("the page's OG is the pin, so the grist moves and the strength is the page's", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  assert.equal(state.roots["batch.scale_pin"], "og");
});

test("the whirlpool split is arithmetic when the page prints per-hop IBUs", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  assert.equal(state.roots["batch.whirlpool_ibu_fraction"], 0.25, "8 + 7 of 60");
  assert.equal(whirlpoolFraction(payload(), mapped()), 0.25);
});

test("a gallons target converts through the artifact, never a constant", () => {
  assert.ok(Math.abs(volumeL({ value: 5, unit: "gal" }) - 18.927) < 0.01);
  assert.equal(volumeL({ value: 20, unit: "l" }), 20);
  assert.equal(volumeL({ value: 13.5, unit: "plato" }), null);
  assert.equal(volumeL(null), null);
});

test("the grain bill is authored as parts and normalised once", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  const grist = state.collections["grist.major_malts"];
  assert.equal(grist.length, 6, "every mapped malt becomes a row");
  const total = grist.reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `the bill sums to 1, got ${total}`);
  assert.ok(grist[0].parts > 0);
});

test("boil hops carry the printed time as a fraction of the boil", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  const boil = state.collections["batch.boil_hops"];
  assert.equal(boil.length, 2);
  assert.ok(boil.every((row) => Math.abs(row.boil_time_fraction - 20 / 60) < 1e-9));
  const pool = boil.reduce((sum, row) => sum + row.pct, 0);
  assert.ok(Math.abs(pool - 1) < 1e-9, "each hop pool normalises on its own");
});

test("whirlpool hops keep their pool and take a start temperature", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  const whirlpool = state.collections["batch.whirlpool_hops"];
  assert.equal(whirlpool.length, 2);
  assert.ok(whirlpool.every((row) => row.initial_temp_c > 0));
  assert.ok(Math.abs(whirlpool.reduce((sum, row) => sum + row.pct, 0) - 1) < 1e-9);
});

test("dry hops are masses with their duration, not IBU shares", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  const dry = state.collections["batch.dry_hops"];
  assert.equal(dry.length, 4);
  assert.ok(dry.every((row) => row.quantity > 0 && row.unit === "g"));
});

test("the mash rest and the yeast become a row and a selection", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  assert.equal(
    state.collections["mash.rests"][0].rest_id,
    "beta_alpha_amylase",
    "152 F is 66.7 C — inside the combined rest's band"
  );
  assert.equal(state.selections["batch.yeast"].name, "British Ale");
});

test("the carrier line is the one selection, whether it is a strain or a blend", () => {
  const ledger = mapped();
  const catalogWithBlend = (kind, id) =>
    id === "blend-1"
      ? { id, name: "Blend: saison + brett", attenuation_pct: 0.78 }
      : catalog(kind, id);
  const blendRow = { ...ledger.find((row) => row.section === "yeasts") };
  blendRow.ref = "blend-1";
  blendRow.ref_name = "Blend: saison + brett";
  const state = projectImport({
    payload: payload(),
    ledger: ledger.map((row) => (row.line_id === blendRow.line_id ? blendRow : row)),
    catalog: catalogWithBlend,
    yeastOutcome: { mode: "single", line_id: blendRow.line_id },
  });
  assert.equal(state.roots["batch.yeast_id"], "blend-1");
  assert.equal(state.selections["batch.yeast"].name, "Blend: saison + brett");
  assert.equal(state.selections["batch.yeast"].attenuation_pct, 0.78);
  assert.equal("batch.yeasts" in state.collections, false, "a blend is a record, not a collection");
});

test("a line whose record was deleted contributes nothing", () => {
  const ledger = mapped().map((row) =>
    row.section === "yeasts" ? { ...row, ref: "y-deleted" } : row
  );
  const state = projectImport({ payload: payload(), ledger, catalog });
  assert.equal("batch.yeast" in state.selections, false, "no dangling snapshot");
  assert.equal("batch.yeast_id" in state.roots, false, "and no dangling id on the root");
  assert.equal(
    state.collections["mash.rests"][0].rest_id,
    "beta_alpha_amylase",
    "the rest of the projection is untouched"
  );
});

test("an unmapped line contributes nothing", () => {
  const ledger = buildLedger(payload()).map((row) => ({ ...row, decision: "unresolved" }));
  const state = projectImport({ payload: payload(), ledger, catalog });
  assert.deepEqual(state.collections["grist.major_malts"], []);
  assert.deepEqual(state.selections, {});
});

test("the projection never seeds identity-derived roots", () => {
  const state = projectImport({ payload: payload(), ledger: mapped(), catalog });
  assert.equal("batch.conversion_efficiency" in state.roots, false);
  assert.equal("batch.delta_v_evap" in state.roots, false);
});
