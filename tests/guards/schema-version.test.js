// Schema-version consistency: the artifact grammar revision appears in the
// validator, the generated inventory, and the grammar doc; the batch payload
// revision appears in the frontend snapshot owner and the backend legacy
// defaults. Drift in any of them silently rejects (or mislabels) stored data.

import test from "node:test";
import assert from "node:assert/strict";

import { SUPPORTED_SCHEMA_VERSIONS } from "../../frontend/src/engine/validate.js";
import { artifact, read } from "./util.js";

function payloadVersion() {
  const source = read("frontend/src/store/snapshot.js");
  const match = source.match(/export const DRAFT_SCHEMA_VERSION = (\d+);/);
  assert.ok(match, "snapshot.js must declare DRAFT_SCHEMA_VERSION");
  return Number(match[1]);
}

function backendLegacyDefaults() {
  const batchSchema = read("backend/app/schemas/batch.py");
  const schemas = [...batchSchema.matchAll(/schema_version: int = (\d+)/g)].map((m) =>
    Number(m[1])
  );
  assert.ok(schemas.length >= 2, "batch.py must declare legacy schema defaults");
  const persistence = read("frontend/src/store/persistence.js");
  const fork = persistence.match(/schema_version: frozen\.schema_version \?\? (\d+)/);
  assert.ok(fork, "persistence.js must fall back to a legacy schema version");
  return [...schemas, Number(fork[1])];
}

test("the artifact grammar revision matches the validator and generated docs", () => {
  const a = artifact();
  const versions = [...SUPPORTED_SCHEMA_VERSIONS];
  assert.deepEqual(
    versions,
    Array.from({ length: versions.length }, (_, i) => i + 1),
    "SUPPORTED_SCHEMA_VERSIONS must be contiguous from 1"
  );
  assert.equal(
    a.schema_version,
    versions.at(-1),
    "artifact schema_version must be the newest supported revision"
  );

  const inventory = read("docs/dag-artifacts/inventory.md");
  const inventoryVersion = inventory.match(/`schema_version`: \*\*(\d+)\*\*/);
  assert.ok(inventoryVersion, "inventory.md must state the grammar revision");
  assert.equal(Number(inventoryVersion[1]), a.schema_version, "inventory.md is stale");

  const grammar = read("docs/dag-artifacts/grammar.md");
  const grammarVersion = grammar.match(/current grammar revision is\s+\*\*(\d+)\*\*/);
  assert.ok(grammarVersion, "grammar.md must state the current grammar revision");
  assert.equal(Number(grammarVersion[1]), a.schema_version, "grammar.md is stale");
});

test("the batch payload revision matches the backend legacy defaults", () => {
  const current = payloadVersion();
  const legacy = backendLegacyDefaults();
  assert.ok(current > 0, "DRAFT_SCHEMA_VERSION must be positive");
  for (const version of legacy) {
    assert.equal(
      version,
      legacy[0],
      `backend legacy schema defaults disagree: ${legacy.join(", ")}`
    );
    assert.ok(
      version <= current,
      `backend legacy schema ${version} is newer than the frontend payload schema ${current}`
    );
  }
});
