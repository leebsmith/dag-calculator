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
  assert.deepEqual(
    shapeReportValidation({
      relations: [],
      domains: [],
      fieldDomains: [],
      collectionDomains: [],
    }),
    { relations: [], domains: [], field_domains: [], collection_domains: [] }
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
