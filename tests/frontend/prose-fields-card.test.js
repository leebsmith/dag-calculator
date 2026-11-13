import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

test("the prose fields write to the draft state", async () => {
  const app = createTestApp();
  await app.boot();

  app.setDiscussion("From the club newsletter.");
  app.setFermentationStrategy("Pitch one pack; hold 19 °C.");

  const state = app.draftState();
  assert.equal(state.discussion, "From the club newsletter.");
  assert.equal(state.fermentation_strategy, "Pitch one pack; hold 19 °C.");
});

test("the prose setters replace non-strings with empty text", async () => {
  const app = createTestApp();
  await app.boot();

  app.setDiscussion("keep");
  app.setDiscussion(42);
  app.setFermentationStrategy(null);

  assert.equal(app.discussion, "");
  assert.equal(app.fermentationStrategy, "");
});

test("loadState restores the prose fields", async () => {
  const app = createTestApp();
  await app.boot();

  await app.loadState({
    discussion: "From the club newsletter.",
    fermentation_strategy: "Pitch one pack; hold 19 °C.",
  });

  assert.equal(app.discussion, "From the club newsletter.");
  assert.equal(app.fermentationStrategy, "Pitch one pack; hold 19 °C.");
});
