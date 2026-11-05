import test from "node:test";
import assert from "node:assert/strict";

import { blendScore, rankBlends } from "../../frontend/src/views/import/blendMatch.js";

const NAMES = ["clean saison strain", "Brettanomyces culture"];

test("a blend scores by how many of the recipe's strain words it names", () => {
  const both = { id: "b1", name: "Blend: Saison + Brett", blend_of: "clean saison, Brettanomyces" };
  const one = { id: "b2", name: "Blend: Saison", blend_of: "clean saison" };
  const none = { id: "b3", name: "Blend: House", blend_of: "English ale" };

  assert.ok(blendScore(both, NAMES) > blendScore(one, NAMES));
  assert.equal(blendScore(none, NAMES), 0);
  assert.equal(blendScore({}, NAMES), 0);
});

test("blends rank best-first, then by name so the list is stable", () => {
  const blends = [
    { id: "b3", name: "Blend: House", blend_of: "English ale" },
    { id: "b2", name: "Blend: Saison", blend_of: "clean saison" },
    { id: "b1", name: "Blend: Saison + Brett", blend_of: "clean saison, Brettanomyces" },
    { id: "b4", name: "Blend: Alias", blend_of: "clean saison, Brettanomyces" },
  ];
  assert.deepEqual(
    rankBlends(blends, NAMES).map((blend) => blend.id),
    ["b4", "b1", "b2", "b3"],
    "ties fall back to the name; unrelated blends stay last, not dropped"
  );
  assert.deepEqual(rankBlends(blends, NAMES, 2).map((blend) => blend.id), ["b4", "b1"]);
  assert.deepEqual(rankBlends([], NAMES), []);
});

test("a strain code is a token like any other", () => {
  const blend = { id: "b1", name: "Blend: 3724 + 5112", blend_of: "RVA 3724, Wyeast 5112" };
  assert.ok(blendScore(blend, ["RVA 3724", "Wyeast 5112"]) >= 2);
});
