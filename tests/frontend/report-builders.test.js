import test from "node:test";
import assert from "node:assert/strict";

import { artifact } from "../guards/util.js";
import { buildReportCatalog } from "../../frontend/src/views/registry/catalog.js";
import { FERMENTABLE_NODES as N } from "../../frontend/src/views/registry/fermentables.js";
import {
  buildReportFormatted,
  buildReportSummaries,
  buildReportTables,
} from "../../frontend/src/views/producer/reportFormat.js";

const A = artifact();
const CATALOG = buildReportCatalog(A);
const COLLECTION_PATH = N.majorMalts;

function engineWith({ values = {}, lists = {} } = {}) {
  return {
    resolve(path) {
      const value = values[path];
      if (value instanceof Error) throw value;
      return value;
    },
    get(path) {
      return lists[path];
    },
    call(name, args) {
      return args?.[0] ?? 0;
    },
  };
}

function recorder() {
  const calls = [];
  const reportError = (scope, err) => calls.push({ scope, err });
  return { calls, reportError };
}

test("formatted values carry the catalog's unit, symbol and decimals", () => {
  const engine = engineWith({ values: { "batch.hlt_starting_volume_l": 20 } });
  const { calls, reportError } = recorder();

  const formatted = buildReportFormatted(A, CATALOG, engine, reportError);

  assert.deepEqual(calls, []);
  assert.equal(formatted["batch.hlt_starting_volume_l"].text.includes("L"), true);
  assert.equal(formatted["batch.hlt_starting_volume_l"].unit, "L");
  assert.equal(typeof formatted["batch.hlt_starting_volume_l"].number, "string");
});

test("formatted values skip collections, nulls and unresolved paths", () => {
  const engine = engineWith({
    values: {
      [COLLECTION_PATH]: [{ name: "Pale" }],
      "batch.hlt_starting_volume_l": null,
      "batch.shrinkage_volume_l": undefined,
    },
  });
  const formatted = buildReportFormatted(A, CATALOG, engine, () => {});

  assert.equal(COLLECTION_PATH in formatted, false, "a row list has no single value");
  assert.equal("batch.hlt_starting_volume_l" in formatted, false);
  assert.equal("batch.shrinkage_volume_l" in formatted, false);
});

test("a throwing resolve is reported and the path is omitted", () => {
  const engine = engineWith({ values: { "batch.hlt_starting_volume_l": new Error("boom") } });
  const { calls, reportError } = recorder();

  const formatted = buildReportFormatted(A, CATALOG, engine, reportError);

  assert.equal("batch.hlt_starting_volume_l" in formatted, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, "reportFormatted.value");
  assert.match(calls[0].err.message, /boom/);
});

test("booleans and taxonomy strings render as text", () => {
  const path = "batch.topology";
  const choice = Object.keys(CATALOG.nodes[path].option_labels)[0];
  const formatted = buildReportFormatted(
    A,
    CATALOG,
    engineWith({ values: { [path]: choice, "batch.hlt_starting_volume_l": true } }),
    () => {}
  );

  assert.equal(formatted[path].text, CATALOG.nodes[path].option_labels[choice]);
  assert.deepEqual(formatted["batch.hlt_starting_volume_l"], { text: "true" });
});

test("an empty recipe still produces every declared table, empty", () => {
  const engine = engineWith();

  const tables = buildReportTables(A, CATALOG, engine, "", () => {});

  assert.deepEqual(tables[N.majorMalts], []);
  assert.deepEqual(tables[N.traceMalts], []);
  assert.deepEqual(tables["report.hop_purchases"], []);
  assert.deepEqual(tables["report.hop_strategy"], []);
  for (const key of [
    "batch.sugars",
    "mash.rests",
    "batch.boil_hops",
    "batch.whirlpool_hops",
    "batch.dry_hops",
  ]) {
    assert.ok(Array.isArray(tables[key]), `${key} is a table`);
  }
});

test("the strategy is carried as one raw markdown row", () => {
  const engine = engineWith();
  const strategy = "  First   paragraph.\n\nSecond paragraph.\n\n\n";

  const tables = buildReportTables(A, CATALOG, engine, strategy, () => {});

  assert.deepEqual(
    tables["report.hop_strategy"].map((row) => row.text.text),
    ["First   paragraph.\n\nSecond paragraph."]
  );
});

test("a grist row formats its amount, share and ppg", () => {
  const engine = engineWith({
    lists: {
      [N.majorMalts]: [
        {
          name: "Pale Ale Malt",
          mass_kg: 4.5,
          color_lovibond: 2,
          yield_fraction: 0.8,
          extract_kg: 3.6,
          pct: 1,
        },
      ],
    },
  });

  const tables = buildReportTables(A, CATALOG, engine, "", () => {});
  const [row] = tables[N.majorMalts];

  assert.equal(row.name.text, "Pale Ale Malt");
  assert.equal(row.amount.text.includes("kg"), true);
  assert.equal(row.ppg.text, "37.0");
  assert.equal(row.own_pct.text, "100.0%");
  assert.equal(row.grist_pct.text, "100.0%");
  assert.equal(row.extract_pct.text, "100.0%");
});

test("an empty recipe has null summaries, not zeroes", () => {
  const summaries = buildReportSummaries(A, CATALOG, engineWith());

  assert.equal(summaries[N.majorMalts].color, null);
  assert.equal(summaries[N.majorMalts].extract_yield, null);
  assert.equal(summaries[N.traceMalts].color, null);
  assert.equal(summaries["batch.sugars"].color, null);
  assert.equal("overall" in summaries, false);
});

test("summaries weight colour and yield by mass across the grist", () => {
  const engine = engineWith({
    lists: {
      [N.majorMalts]: [
        { name: "Pale", mass_kg: 4, color_lovibond: 2, yield_fraction: 0.8 },
        { name: "Crystal", mass_kg: 1, color_lovibond: 60, yield_fraction: 0.7 },
      ],
    },
  });

  const summaries = buildReportSummaries(A, CATALOG, engine);

  assert.equal(summaries[N.majorMalts].color.text, "26.8 EBC");
  assert.equal(summaries.overall.color.text, summaries[N.majorMalts].color.text);
});
