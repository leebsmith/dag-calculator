// Choice labels: the dose-relevant water choices must map every taxonomy member
// to human prose, so a new salt form, acid strength, or distribution mode cannot
// render as a raw code. Grow this list when another code-like choice is labelled.

import test from "node:test";
import assert from "node:assert/strict";

import { artifact } from "./util.js";
import { waterRegistry } from "../../frontend/src/views/registry/water.js";

const LABELLED = [
  "water.salt_distribution",
  "water.gypsum_form",
  "water.cacl2_form",
  "water.acid_medium",
];

test("every member of a labelled choice taxonomy has an optionLabel", () => {
  const a = artifact();
  for (const id of LABELLED) {
    const taxonomy = a.nodes[id]?.taxonomy;
    assert.ok(taxonomy, `${id} is not a choice node`);
    const members = a.taxonomies[taxonomy] ?? [];
    const labels = waterRegistry[id]?.optionLabels ?? {};
    assert.deepEqual(
      Object.keys(labels).sort(),
      [...members].sort(),
      `${id} optionLabels must cover exactly taxonomy "${taxonomy}"`
    );
  }
});
