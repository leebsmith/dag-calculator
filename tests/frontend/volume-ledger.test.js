// Volume ledger presentation: accounting parentheses for subtractions and the
// fixed sign slots that keep the decimals aligned with positive values.

import test from "node:test";
import assert from "node:assert/strict";

import { createTestApp } from "./appHelpers.js";
import { steps } from "../../frontend/src/views/steps.js";

const SUBTRACTIONS = [
  "Grain absorption",
  "Mash dead space",
  "Mash transfer loss",
  "Boil-off",
  "Shrinkage",
  "Kettle dead space",
  "Kettle transfer",
  "Trub",
];

function ledgerEntry() {
  for (const step of steps) {
    const entry = step.fields.find(
      (field) => field && typeof field === "object" && field.table === "volume-ledger"
    );
    if (entry) return entry;
  }
  return null;
}

async function bootedLedger() {
  const app = createTestApp();
  await app.boot();
  return app.fieldsBySlice.batch.find((field) => field.id === "volume-ledger");
}

test("the volume ledger is an accounting table with right-aligned values", async () => {
  const ledger = await bootedLedger();
  assert.ok(ledger);
  assert.equal(ledger.accounting, true);
  assert.equal(ledger.columns.find((column) => column.id === "value").align, "right");
});

test("the loss rows are subtractions and carry no label prefixes", () => {
  const entry = ledgerEntry();
  assert.ok(entry);

  const labels = entry.rows.filter((row) => row.subtract).map((row) => row.label);
  assert.deepEqual(labels, SUBTRACTIONS);
  assert.ok(!entry.rows.some((row) => /^[−＋]/.test(row.label)));
});

test("valuation carries the subtraction flag to the template", async () => {
  const ledger = await bootedLedger();
  const byLabel = Object.fromEntries(
    ledger.rows.map((row) => [row.cells.label?.text, row])
  );

  assert.equal(byLabel.Shrinkage.subtract, true);
  assert.equal(byLabel["Late-addition volume"].subtract, false);
  assert.equal(byLabel["Fermenter (cold)"].subtract, false);
});
