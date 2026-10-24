import test from "node:test";
import assert from "node:assert/strict";

import {
  BATCH_SCOPES,
  batchesForScope,
  formatDate,
  identityLabel,
  parentLabel,
  sortBatches,
} from "../../frontend/src/store/recipeList.js";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function batch(id, overrides = {}) {
  return {
    id,
    name: id,
    status: "draft",
    trashed: false,
    updated_at: NOW / 1000,
    ...overrides,
  };
}

const BATCHES = [
  batch("draft-new", { updated_at: NOW / 1000 }),
  batch("draft-old", { updated_at: NOW / 1000 - 10 }),
  batch("frozen", { status: "frozen", updated_at: NOW / 1000 - 5 }),
  batch("trashed", { trashed: true, updated_at: NOW / 1000 - 1 }),
];

test("scopes partition drafts, frozen, and trash", () => {
  assert.deepEqual(BATCH_SCOPES, ["all", "drafts", "frozen", "trash"]);

  const ids = (scope) => batchesForScope(BATCHES, scope).map((b) => b.id);

  assert.deepEqual(ids("all"), ["draft-new", "frozen", "draft-old"]);
  assert.deepEqual(ids("drafts"), ["draft-new", "draft-old"]);
  assert.deepEqual(ids("frozen"), ["frozen"]);
  assert.deepEqual(ids("trash"), ["trashed"]);
});

test("scope defaults to all and sorts by modified", () => {
  assert.deepEqual(
    batchesForScope(BATCHES).map((b) => b.id),
    ["draft-new", "frozen", "draft-old"]
  );
});

test("sort by title is case-insensitive and numeric-aware", () => {
  const rows = [batch("recipe 10"), batch("Recipe 2"), batch("recipe 1")];
  assert.deepEqual(
    sortBatches(rows, "title").map((b) => b.id),
    ["recipe 1", "Recipe 2", "recipe 10"]
  );
  assert.deepEqual(
    batchesForScope(rows, "all", { sort: "title" }).map((b) => b.id),
    ["recipe 1", "Recipe 2", "recipe 10"]
  );
});

test("sortBatches does not mutate the input", () => {
  const input = [batch("b", { updated_at: 1 }), batch("a", { updated_at: 2 })];
  const before = input.map((b) => b.id);
  sortBatches(input, "title");
  assert.deepEqual(input.map((b) => b.id), before);
});

test("row labels read the identity snapshot", () => {
  const row = batch("x", {
    identity: {
      style: { id: "21A", name: "American IPA" },
      equipment: { id: "herms-30l", name: "HERMS 30L" },
      "water.source": { laboratory: "Ward Lab" },
    },
    parent_name: "House Pale",
  });

  assert.equal(identityLabel(row, "style"), "American IPA");
  assert.equal(identityLabel(row, "equipment"), "HERMS 30L");
  assert.equal(identityLabel(row, "water.source", "laboratory"), "Ward Lab");
  assert.equal(identityLabel(batch("y"), "style"), "");
  assert.equal(parentLabel(row), "House Pale");
  assert.equal(parentLabel(batch("y")), "");
});

test("formatDate renders a short date or an em dash", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(undefined), "—");
  assert.equal(formatDate(Number.NaN), "—");
  assert.equal(
    formatDate(Date.UTC(2026, 9, 21, 12) / 1000, { locale: "en-US", timeZone: "UTC" }),
    "Oct 21, 2026"
  );
});
