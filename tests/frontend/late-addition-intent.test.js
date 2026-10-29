// P3b late-addition intent: share-mode allocation, mode round-trip, advisories,
// and the self-describing freeze payload.

import test from "node:test";
import assert from "node:assert/strict";

import { sharedTestApp } from "./appHelpers.js";
import {
  resolvedSugarMasses,
  sugarShareFromDose,
} from "../../frontend/src/views/producer/sugarAllocation.js";

const SUGAR = {
  sugar_id: "dextrose",
  name: "Dextrose",
  mass_kg: 0.5,
  parts: 0,
  resolved_mass_kg: 0,
  yield_fraction: 0.9,
  yield_basis: "extract",
  yield_provenance: {},
  fermentability_fraction: 1,
  fermentability_provenance: {},
  fermentability_basis: "real",
  fermentability_method: "",
  color_lovibond: 0,
  notes: "",
};

async function appWithSugar(overrides = {}) {
  const app = await sharedTestApp();
  app.engine.setCollection("batch.sugars", [{ ...SUGAR, ...overrides }]);
  app.compute();
  return app;
}

test("share mode allocates extract by Hamilton parts, then converts to mass", () => {
  const rows = [
    { parts: 1, yield_fraction: 0.8, mass_kg: 0 },
    { parts: 3, yield_fraction: 1.0, mass_kg: 0 },
  ];
  const resolved = resolvedSugarMasses({ rows, budgetKg: 4.0, share: 0.1 });

  assert.equal(resolved.length, 2);
  const extractTotal = resolved.reduce((sum, row) => sum + row.extractKg, 0);
  assert.ok(Math.abs(extractTotal - 4.0) < 1e-9, "the budget splits exactly");
  assert.ok(Math.abs(resolved[0].extractKg - 1.0) < 1e-9);
  assert.ok(Math.abs(resolved[1].extractKg - 3.0) < 1e-9);
  assert.ok(Math.abs(resolved[0].massKg - 1.0 / 0.8) < 1e-9);
  assert.ok(Math.abs(resolved[1].massKg - 3.0) < 1e-9);
});

test("share from dose is the current sugar extract over total extract", () => {
  assert.equal(sugarShareFromDose([SUGAR], 2.6), Math.min(0.95, 0.45 / 2.6));
  assert.equal(sugarShareFromDose([], 2.6), 0);
  assert.equal(sugarShareFromDose([SUGAR], 0), 0);
});

test("dose -> share seeds the authored share and parts once", async () => {
  const app = await appWithSugar();

  app.setLateAdditionIntent("share");
  app.compute();

  const share = app.engine.get("batch.sugar_extract_share");
  const rows = app.engine.get("batch.sugars");
  assert.equal(app.lateAdditionIntent, "share");
  assert.ok(Math.abs(share - 0.45 / 2.6) < 1e-9);
  assert.ok(Math.abs(rows[0].parts - 0.45) < 1e-9);

  // A later switch does not overwrite either authored representation.
  app.setLateAdditionIntent("dose");
  app.compute();
  app.setLateAdditionIntent("share");
  app.compute();
  assert.equal(app.engine.get("batch.sugar_extract_share"), share);
  assert.equal(app.engine.get("batch.sugars")[0].parts, rows[0].parts);
  assert.equal(app.engine.get("batch.sugars")[0].mass_kg, 0.5);
});

test("adopt actions re-sync the other representation on request", async () => {
  const app = await appWithSugar();
  app.setLateAdditionIntent("share");
  app.compute();

  app.setRoot("batch.sugar_extract_share", 0.2);
  app.compute();
  app.adoptLateAdditionShare();
  app.compute();

  const adopted = app.engine.get("batch.sugars")[0];
  assert.ok(Math.abs(adopted.mass_kg - (0.2 * 2.6) / 0.9) < 1e-6);
  assert.ok(
    Math.abs(adopted.mass_kg - adopted.resolved_mass_kg) < 1e-6,
    "the authored dose and the computed mass agree after adoption"
  );

  app.adoptLateAdditionDose();
  app.compute();
  assert.ok(Math.abs(app.engine.get("batch.sugar_extract_share") - 0.2) < 1e-6);
});

test("share-mode guardrails are advisories, never silent", async () => {
  const app = await sharedTestApp();

  app.setRoot("batch.late_addition_intent", "share");
  app.setRoot("batch.sugar_extract_share", 0.1);
  app.compute();
  assert.ok(app.findingsById.sugar_share_without_sugar);
  assert.equal(app.findingsById.sugar_share_without_sugar.severity, "warning");

  app.setRoot("batch.sugar_extract_share", 0.95);
  app.compute();
  assert.ok(app.findingsById.sugar_share_high);
});

test("the sugar-effect readout uses the active share-derived extract", async () => {
  const app = await appWithSugar();
  app.setLateAdditionIntent("share");
  app.compute();
  app.setRoot("batch.sugar_extract_share", 0.2);
  app.compute();

  assert.ok(app.sugarEffect.active);
  assert.ok(Math.abs(app.sugarEffect.share - 0.2) < 1e-9);
});

test("dose mode keeps the wire on the authored dose", async () => {
  const app = await appWithSugar();
  assert.equal(app.engine.get("batch.late_addition_intent"), "dose");
  assert.equal(app.engine.get("batch.sugar_share_request"), 0);
  assert.equal(app.engine.get("batch.s_late_add_request"), 0.45);
  assert.equal(app.engine.get("batch.sugar_extract_total"), 0.45);
});

test("freeze records mode, share, parts, and resolved masses", async () => {
  const app = await appWithSugar();
  app.setLateAdditionIntent("share");
  app.compute();
  app.setRoot("batch.sugar_extract_share", 0.2);
  app.compute();

  const payload = app.freezePayload();
  assert.equal(payload.valuation["batch.late_addition_intent"], "share");
  assert.equal(payload.valuation["batch.sugar_extract_share"], 0.2);
  const row = payload.valuation["batch.sugars"][0];
  assert.ok(row.parts > 0);
  assert.ok(row.resolved_mass_kg > 0);
});
