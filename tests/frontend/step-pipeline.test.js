// The card refresh pipeline: the order is data, and every card's `refresh*Card`
// export appears in it exactly once.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CARD_REFRESHES } from "../../frontend/src/adapters/stepView.js";
import { withFreshApp } from "./appHelpers.js";

const CARDS = fileURLToPath(new URL("../../frontend/src/adapters/cards/", import.meta.url));

const DECLARED_ORDER = [
  "yeast",
  "style",
  "malt",
  "traceMalts",
  "hop",
  "lateAdditions",
  "mash",
  "brewDay",
  "dryHops",
  "water",
];

function cardFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cardFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

function exportedRefreshes() {
  const names = new Set();
  for (const file of cardFiles(CARDS)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^export function (refresh\w+Card)\b/gm)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

test("every card refresh is declared exactly once", () => {
  const declared = CARD_REFRESHES.map((entry) => entry.refresh.name);
  assert.deepEqual([...declared].sort(), exportedRefreshes());
  assert.equal(new Set(declared).size, declared.length);
});

test("the pipeline order is the declared order", () => {
  assert.deepEqual(
    CARD_REFRESHES.map((entry) => entry.card),
    DECLARED_ORDER
  );
  assert.deepEqual(CARD_REFRESHES.map((entry) => entry.refresh.name), [
    "refreshYeastCard",
    "refreshStyleCard",
    "refreshMaltCard",
    "refreshTraceMaltsCard",
    "refreshHopCard",
    "refreshLateAdditionsCard",
    "refreshMashCard",
    "refreshBrewDayCard",
    "refreshDryHopCard",
    "refreshWaterCard",
  ]);
});

test("compute produces fields, indexes status, then refreshes every card", withFreshApp(async (app) => {
  app.compute();

  assert.ok(app.fieldsById["batch.yeast_id"]);
  assert.equal(typeof app.violationCount, "number");
  for (const slice of Object.keys(app.fieldsBySlice)) {
    assert.ok(app.stepStatus[slice], `${slice} has a status bucket`);
  }

  assert.equal(Number.isFinite(app.styleSolvedAa), true);
  assert.ok(Array.isArray(app.styleRegion));
  assert.ok(Array.isArray(app.sugarList));
  assert.equal(typeof app.sugarCountLabel, "string");
  assert.equal(typeof app.scalePin, "string");
}));
