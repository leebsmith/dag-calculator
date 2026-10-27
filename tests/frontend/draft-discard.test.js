// Cancel on a changed draft is destructive: it asks before discarding scratch
// state, while Save and an untouched draft close without a prompt.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";

async function bootedApp() {
  const app = createTestApp();
  await app.boot();
  return app;
}

test("an untouched draft cancels without a prompt", async () => {
  const app = await bootedApp();

  app.openMaltEditor();
  assert.equal(app.draftDirty, false);
  app.cancelMaltEditor();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.maltEditorOpen, false);
});

test("Cancel on a changed draft asks, keeps the draft, then discards on confirm", async () => {
  const app = await bootedApp();

  app.openMaltEditor();
  app.editDraftCell(0, "parts", 20);
  assert.equal(app.draftDirty, true);

  app.cancelMaltEditor();
  assert.equal(app.draftDiscardOpen, true);
  assert.equal(app.maltEditorOpen, true);
  assert.equal(app.draftRows[0].parts, 20);

  app.dismissDraftDiscard();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.maltEditorOpen, true);

  app.cancelMaltEditor();
  app.confirmDraftDiscard();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.maltEditorOpen, false);
  assert.equal(app.draftRows.length, 0);
});

test("the sugar editor shares the same dirty guard", async () => {
  const app = await bootedApp();
  const sugar = app.sugarCatalog[0];

  app.openSugarEditor();
  app.addCatalogSugar(sugar.id);
  app.cancelSugarEditor();
  assert.equal(app.draftDiscardOpen, true);
  assert.equal(app.sugarEditorOpen, true);

  app.confirmDraftDiscard();
  assert.equal(app.sugarEditorOpen, false);
});

test("Escape dismisses the prompt first, then closes the drawer, then cancels", async () => {
  const app = await bootedApp();

  app.openMaltEditor();
  app.editDraftCell(0, "parts", 20);
  app.openMaltSearch();
  assert.equal(app.maltDrawer, "search");

  app.handleMaltEscape();
  assert.equal(app.maltDrawer, null);
  assert.equal(app.maltEditorOpen, true);

  app.handleMaltEscape();
  assert.equal(app.draftDiscardOpen, true);
  assert.equal(app.maltEditorOpen, true);

  app.handleMaltEscape();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.maltEditorOpen, true);
});

test("Save closes a changed draft without asking", async () => {
  const app = await bootedApp();

  app.openSugarEditor();
  app.addCatalogSugar(app.sugarCatalog[0].id);
  assert.equal(app.draftDirty, true);

  app.saveSugarEditor();
  assert.equal(app.draftDiscardOpen, false);
  assert.equal(app.sugarEditorOpen, false);
});

test("every draft editor guards Cancel", async () => {
  const app = await bootedApp();

  app.openHopEditor();
  if (app.draftRows.length === 0) app.addDraftRow({ hop_id: "test-hop", name: "Test", parts: 30, pct: 0 });
  app.editDraftCell(0, "parts", 30);
  app.cancelHopEditor();
  assert.equal(app.draftDiscardOpen, true);
  app.confirmDraftDiscard();

  app.openWhirlpoolHopEditor();
  if (app.draftRows.length === 0) app.addDraftRow({ hop_id: "test-hop", name: "Test", parts: 30, pct: 0 });
  app.editDraftCell(0, "parts", 30);
  app.cancelWhirlpoolHopEditor();
  assert.equal(app.draftDiscardOpen, true);
  app.confirmDraftDiscard();

  app.openTraceEditor();
  if (app.draftRows.length === 0) app.addDraftRow({ name: "Test", mass_kg: 0.05 });
  app.editDraftCell(0, "mass_kg", 0.05);
  app.cancelTraceEditor();
  assert.equal(app.draftDiscardOpen, true);
  app.confirmDraftDiscard();

  assert.equal(app.hopEditorOpen, false);
  assert.equal(app.whirlpoolHopEditorOpen, false);
  assert.equal(app.traceEditorOpen, false);
});
