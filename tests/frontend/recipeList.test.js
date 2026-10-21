import test from "node:test";
import assert from "node:assert/strict";

import {
  FREEZE_RAIL_LIMIT,
  draftSections,
  formatDate,
  frozenBatches,
  recentFreezes,
  sortBatches,
  trashedBatches,
} from "../../frontend/src/store/recipeList.js";

const DAY = 24 * 60 * 60;
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

test("draftSections partitions at 30 days and drops frozen/trashed rows", () => {
  const batches = [
    batch("recent", { updated_at: NOW / 1000 - DAY }),
    batch("edge", { updated_at: NOW / 1000 - 30 * DAY }),
    batch("older", { updated_at: NOW / 1000 - 31 * DAY }),
    batch("frozen", { status: "frozen", frozen_at: NOW / 1000 }),
    batch("trashed", { trashed: true }),
  ];

  const sections = draftSections(batches, { now: NOW });
  assert.deepEqual(
    sections.map((s) => [s.key, s.batches.map((b) => b.id)]),
    [
      ["recent", ["recent", "edge"]],
      ["older", ["older"]],
    ]
  );
});

test("draftSections omits empty groups", () => {
  assert.deepEqual(draftSections([], { now: NOW }), []);
  const olderOnly = draftSections([batch("old", { updated_at: NOW / 1000 - 40 * DAY })], {
    now: NOW,
  });
  assert.deepEqual(olderOnly.map((s) => s.key), ["older"]);
});

test("sort by modified is newest first and by title is A-Z within a group", () => {
  const batches = [
    batch("bravo", { updated_at: NOW / 1000 - DAY }),
    batch("alpha", { updated_at: NOW / 1000 - 2 * DAY }),
    batch("charlie", { updated_at: NOW / 1000 - 3 * DAY }),
  ];

  assert.deepEqual(
    draftSections(batches, { now: NOW, sort: "modified" })[0].batches.map((b) => b.id),
    ["bravo", "alpha", "charlie"]
  );
  assert.deepEqual(
    draftSections(batches, { now: NOW, sort: "title" })[0].batches.map((b) => b.id),
    ["alpha", "bravo", "charlie"]
  );
});

test("sortBatches does not mutate the input", () => {
  const input = [batch("b", { updated_at: 1 }), batch("a", { updated_at: 2 })];
  const before = input.map((b) => b.id);
  sortBatches(input, "title");
  assert.deepEqual(input.map((b) => b.id), before);
});

test("title sort is case-insensitive and numeric-aware", () => {
  const batches = [batch("recipe 10"), batch("Recipe 2"), batch("recipe 1")];
  assert.deepEqual(
    sortBatches(batches, "title").map((b) => b.id),
    ["recipe 1", "Recipe 2", "recipe 10"]
  );
});

test("frozenBatches sorts by frozen_at newest first and excludes trashed", () => {
  const batches = [
    batch("old", { status: "frozen", frozen_at: 100 }),
    batch("new", { status: "frozen", frozen_at: 300 }),
    batch("trashed", { status: "frozen", frozen_at: 400, trashed: true }),
    batch("draft", { status: "draft" }),
  ];
  assert.deepEqual(frozenBatches(batches).map((b) => b.id), ["new", "old"]);
});

test("recentFreezes caps the rail", () => {
  const batches = Array.from({ length: FREEZE_RAIL_LIMIT + 3 }, (_, i) =>
    batch(`f${i}`, { status: "frozen", frozen_at: i + 1 })
  );
  assert.equal(recentFreezes(batches).length, FREEZE_RAIL_LIMIT);
  assert.equal(recentFreezes(batches)[0].id, `f${FREEZE_RAIL_LIMIT + 2}`);
  assert.equal(recentFreezes(batches, 2).length, 2);
});

test("trashedBatches keeps both statuses, newest modified first", () => {
  const batches = [
    batch("a", { trashed: true, updated_at: 10 }),
    batch("b", { trashed: true, updated_at: 30 }),
    batch("c", { updated_at: 40 }),
  ];
  assert.deepEqual(trashedBatches(batches).map((b) => b.id), ["b", "a"]);
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
