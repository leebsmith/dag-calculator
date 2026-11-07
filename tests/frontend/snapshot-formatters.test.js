import test from "node:test";
import assert from "node:assert/strict";

import {
  shapeDraftState,
  shapeFreezePayload,
  shapeFrozenValue,
  shapeProvenanceEntry,
  shapeReportInputs,
  shapeReportValidation,
  shapeTelemetryEntry,
} from "../../frontend/src/views/snapshotFormatters.js";

test("shapeFrozenValue keeps declared boundary outputs only", () => {
  const node = { kind: "boundary", outputs: { a: {}, b: {} } };
  assert.deepEqual(shapeFrozenValue({ outputs: { a: 1, b: 2, extra: 3 } }, node), {
    a: 1,
    b: 2,
  });
  assert.equal(shapeFrozenValue(undefined, node), null);
  assert.equal(shapeFrozenValue(5, { kind: "derived" }), 5);
});

test("shapeDraftState copies the mutable maps and defaults the strategy", () => {
  const identity = { id: "b1" };
  const collections = { rows: [] };
  const selections = { yeast: { id: "y1" } };
  const state = shapeDraftState({
    identity,
    hopStrategy: undefined,
    roots: { a: 1 },
    collections,
    selections,
    schemaVersion: 4,
  });

  assert.equal(state.hop_strategy, "");
  assert.equal(state.schema_version, 4);
  assert.deepEqual(state.roots, { a: 1 });
  assert.notEqual(state.identity, identity);
  assert.notEqual(state.collections, collections);
  assert.notEqual(state.selections, selections);
});

test("shapeDraftState detaches Alpine-proxied maps", () => {
  const collections = new Proxy({ "batch.sugars": [{ mass_kg: 1 }] }, {});
  const selections = new Proxy({ "batch.yeast": { id: "y1" } }, {});
  const state = shapeDraftState({
    identity: {},
    hopStrategy: "",
    roots: {},
    collections,
    selections,
    schemaVersion: 4,
  });

  assert.deepEqual(state.collections, { "batch.sugars": [{ mass_kg: 1 }] });
  assert.deepEqual(state.selections, { "batch.yeast": { id: "y1" } });
});

test("shapeDraftState detaches collections and selections from later edits", () => {
  const collections = { "batch.sugars": [{ mass_kg: 1 }] };
  const selections = { "batch.yeast": { id: "y1" } };
  const state = shapeDraftState({
    identity: {},
    hopStrategy: "",
    roots: {},
    collections,
    selections,
    schemaVersion: 4,
  });

  collections["batch.sugars"][0].mass_kg = 2;
  selections["batch.yeast"].id = "y2";

  assert.equal(state.collections["batch.sugars"][0].mass_kg, 1);
  assert.equal(state.selections["batch.yeast"].id, "y1");
});

test("shapeFreezePayload carries the format and a null conformance default", () => {
  assert.deepEqual(
    shapeFreezePayload({
      valuation: { a: 1 },
      provenance: {},
      schemaVersion: 4,
      valuationFormat: "outputs",
      conformance: undefined,
    }),
    {
      valuation: { a: 1 },
      valuation_format: "outputs",
      provenance: {},
      schema_version: 4,
      conformance: null,
    }
  );
  assert.deepEqual(shapeProvenanceEntry("std:pale"), { source_template_id: "std:pale" });
});

test("report inputs keep the wire keys and default missing advisories", () => {
  const relations = [{ id: "r" }];
  const domains = [{ id: "d" }];
  const fieldDomains = [{ id: "f" }];
  const collectionDomains = [{ id: "c" }];
  assert.deepEqual(
    shapeReportValidation({
      relations,
      domains,
      fieldDomains,
      collectionDomains,
    }),
    {
      relations,
      domains,
      field_domains: fieldDomains,
      collection_domains: collectionDomains,
    }
  );
  assert.deepEqual(shapeTelemetryEntry({ binding: "b", fingerprint: "f" }), {
    binding: "b",
    fingerprint: "f",
    telemetry: [],
    warnings: [],
    notes: [],
  });
  assert.deepEqual(shapeReportInputs({ validation: { a: 1 }, telemetry: {} }), {
    validation: { a: 1 },
    telemetry: {},
  });
});

test("shapeFrozenValue keeps non-boundary scalars and drops undeclared outputs", () => {
  assert.deepEqual(shapeFrozenValue({ outputs: { a: 1 } }, { kind: "boundary" }), {});
  assert.deepEqual(shapeFrozenValue({ outputs: { a: 1 } }, { kind: "boundary", outputs: {} }), {});
  assert.equal(shapeFrozenValue("text", { kind: "constant" }), "text");
  assert.equal(shapeFrozenValue(0, { kind: "root" }), 0);
});

test("shapeDraftState copies identity, collections, and selections but keeps roots", () => {
  const identity = { id: "b1" };
  const roots = { "batch.target_abv": 6.2 };
  const collections = { "batch.sugars": [{ id: "s1" }] };
  const selections = { "batch.yeast": { id: "y1" } };
  const state = shapeDraftState({
    identity,
    hopStrategy: "60/40",
    roots,
    collections,
    selections,
    schemaVersion: 4,
  });
  assert.equal(state.roots, roots);
  assert.deepEqual(state.identity, identity);
  assert.deepEqual(state.collections, collections);
  assert.deepEqual(state.selections, selections);
  assert.notEqual(state.identity, identity);
  assert.notEqual(state.collections, collections);
  assert.notEqual(state.selections, selections);
  assert.equal(state.hop_strategy, "60/40");
});

test("shapeFreezePayload preserves conformance and provenance values", () => {
  const conformance = { sai: 100 };
  const provenance = { "batch.yeast": { source_template_id: "std:y" } };
  assert.deepEqual(
    shapeFreezePayload({
      valuation: { a: 1 },
      provenance,
      schemaVersion: 4,
      valuationFormat: "outputs",
      conformance,
    }),
    {
      valuation: { a: 1 },
      valuation_format: "outputs",
      provenance,
      schema_version: 4,
      conformance,
    }
  );
});

test("shapeTelemetryEntry preserves declared advisory arrays", () => {
  const telemetry = [{ severity: "WARNING" }];
  const warnings = [{ code: "w" }];
  const notes = [{ code: "n" }];
  assert.deepEqual(
    shapeTelemetryEntry({
      binding: "b",
      fingerprint: "f",
      extra: { telemetry, warnings, notes },
    }),
    {
      binding: "b",
      fingerprint: "f",
      telemetry,
      warnings,
      notes,
    }
  );
});
