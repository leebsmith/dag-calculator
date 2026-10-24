import test from "node:test";
import assert from "node:assert/strict";

import { createCalculator } from "../../frontend/src/engine/index.js";
import { createSession } from "../../frontend/src/adapters/session.js";
import { createTestApp } from "./appHelpers.js";
import { createReferenceCache } from "../../frontend/src/store/referenceCache.js";
import { identityFixture, loadArtifact } from "./helpers.js";

const artifact = loadArtifact();
const cache = createReferenceCache();
const [YEAST_ID, YEAST] = Object.entries(cache.references.yeast)[0];

test("the engine resolves a selection from the batch snapshot first", () => {
  const snapshot = { ...YEAST, name: "Snapshot Yeast" };
  const calc = createCalculator(artifact, {
    identity: identityFixture(),
    references: { yeast: { [YEAST_ID]: { ...YEAST, name: "Library Yeast" } } },
    selections: { "batch.yeast": snapshot },
    roots: { "batch.yeast_id": YEAST_ID },
  });

  assert.equal(calc.get("batch.yeast").name, "Snapshot Yeast");
});

test("without a snapshot the engine falls back to the library reference", () => {
  const calc = createCalculator(artifact, {
    identity: identityFixture(),
    references: { yeast: { [YEAST_ID]: YEAST } },
    roots: { "batch.yeast_id": YEAST_ID },
  });

  assert.equal(calc.get("batch.yeast").name, YEAST.name);
});

test("library edits do not perturb a batch that carries a snapshot", () => {
  const localCache = {
    references: { yeast: { [YEAST_ID]: { ...YEAST } } },
    collections: {},
  };
  const master = { allRoots: () => ({ "batch.yeast_id": YEAST_ID }), replaceRoots() {} };
  const session = createSession({
    artifact,
    cache: localCache,
    master,
    identity: identityFixture(),
  });
  session.setSelection("batch.yeast", YEAST);

  localCache.references.yeast[YEAST_ID] = { ...YEAST, name: "Edited In The Library" };
  session.engine.invalidate("batch.yeast");

  assert.equal(session.getEngine().get("batch.yeast").name, YEAST.name);
});

test("picking a component copies it forward; clearing removes the copy", async () => {
  const app = createTestApp();
  await app.boot();

  app.selectYeast(YEAST_ID);
  assert.equal(app.draftState().selections["batch.yeast"].name, YEAST.name);

  app.clearYeastSelection();
  assert.equal("batch.yeast" in app.draftState().selections, false);
});

test("selections survive save -> load -> freeze", async () => {
  const first = createTestApp();
  await first.boot();
  first.selectYeast(YEAST_ID);
  const state = first.draftState();

  const second = createTestApp();
  await second.boot();
  await second.loadState(state);
  assert.equal(second.selectedYeast.name, YEAST.name);

  const payload = second.freezePayload();
  assert.equal(payload.provenance["batch.yeast"].source_template_id, YEAST_ID);
  assert.equal("source_revision" in payload.provenance["batch.yeast"], false);
  assert.equal(payload.valuation["batch.yeast"].name, YEAST.name);
});

test("a legacy draft without a snapshot materialises it and marks dirty", async () => {
  const app = createTestApp();
  await app.boot();
  let changes = 0;
  app.onChange = () => (changes += 1);

  await app.loadState({
    roots: { "batch.yeast_id": YEAST_ID },
    collections: {},
    selections: {},
  });

  assert.equal(app.draftState().selections["batch.yeast"].id, YEAST_ID);
  assert.ok(changes > 0);
});
