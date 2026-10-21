import test from "node:test";
import assert from "node:assert/strict";

import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";
import { loadArtifact } from "./helpers.js";
import { VALUATION_FORMAT } from "../../frontend/src/store/snapshot.js";

const artifact = loadArtifact();
const BOUNDARY_IDS = Object.entries(artifact.nodes)
  .filter(([, node]) => node.kind === "boundary")
  .map(([id]) => id);

function assertJsonFinite(value, path) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} is not finite (${value})`);
    return;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertJsonFinite(entry, `${path}[${i}]`));
    return;
  }
  assert.equal(typeof value, "object", `${path} is not JSON-serializable`);
  for (const [key, entry] of Object.entries(value)) assertJsonFinite(entry, `${path}.${key}`);
}

test("frozen valuation covers every node id", async () => {
  const app = createStepApp();
  await app.boot();
  const { valuation } = app.freezePayload();

  assert.deepEqual(Object.keys(valuation).sort(), Object.keys(artifact.nodes).sort());
});

test("frozen valuation stores boundary outputs, not cache wrappers", async () => {
  const app = createStepApp();
  await app.boot();
  const payload = app.freezePayload();

  assert.equal(payload.valuation_format, VALUATION_FORMAT);
  for (const id of BOUNDARY_IDS) {
    const value = payload.valuation[id];
    assert.equal(typeof value, "object", `${id} missing from valuation`);
    assert.equal(value.outputs, undefined, `${id} still stores an outputs wrapper`);
    assert.equal(value.fingerprint, undefined, `${id} still stores a fingerprint wrapper`);
    assert.ok(Object.keys(value).length > 0, `${id} has no outputs`);
  }
  assert.equal(typeof payload.valuation["solver.batch"].sg_post_boil, "number");
});

test("frozen valuation is JSON-serializable and finite", async () => {
  const app = createStepApp();
  await app.boot();
  app.setRoot("batch.target_ibu", 42);
  const { valuation } = app.freezePayload();

  assert.doesNotThrow(() => JSON.stringify(valuation));
  for (const [id, value] of Object.entries(valuation)) {
    if (id === "batch.style_id" || id === "batch.yeast_id") continue;
    assertJsonFinite(value, id);
  }
});

test("fork only needs roots and collections, not the valuation", async () => {
  const app = createStepApp();
  await app.boot();
  const state = app.draftState();

  assert.ok("roots" in state);
  assert.ok("collections" in state);
  assert.equal("valuation" in state, false);
});
