// Taxonomy coverage: every artifact taxonomy that host code switches on must
// have a matching host map or seed definition. A new member without one either
// throws at runtime or silently falls back.

import test from "node:test";
import assert from "node:assert/strict";

import { CATEGORY_DEFAULT_F } from "../../frontend/src/adapters/boundaryRequest.js";
import { PRODUCT_FORM_UTILIZATION } from "../../frontend/src/views/whirlpool.js";
import { WATER_IONS } from "../../frontend/src/views/registry/water.js";
import { artifact, read } from "./util.js";

const MASKS = JSON.parse(read("data/seeds/mash-rests.json"));
const SCHEDULES = JSON.parse(read("data/seeds/mash-schedules.json"));

function taxonomy(a, id) {
  return new Set(a.taxonomies[id]);
}

test("mash_rest taxonomy and mash-rests definitions are in lockstep", () => {
  const a = artifact();
  assert.deepEqual([...taxonomy(a, "mash_rest")].sort(), Object.keys(MASKS).sort());
});

test("mash_preset taxonomy and mash-schedules are in lockstep", () => {
  const a = artifact();
  assert.deepEqual([...taxonomy(a, "mash_preset")].sort(), Object.keys(SCHEDULES).sort());
});

test("every enabled preset rest has a temperature and duration", () => {
  for (const [presetId, schedule] of Object.entries(SCHEDULES)) {
    for (const rest of schedule.rests) {
      if (!rest.enabled) continue;
      assert.notEqual(rest.use_temp_c, null, `${presetId}:${rest.rest_id} temp`);
      assert.notEqual(rest.duration_min, null, `${presetId}:${rest.rest_id} duration`);
    }
  }
});

test("malt_category covers the batch fermentability fallback map", () => {
  const a = artifact();
  assert.deepEqual(
    [...taxonomy(a, "malt_category")].sort(),
    Object.keys(CATEGORY_DEFAULT_F).sort()
  );
});

test("whirlpool_hop_form covers the product utilization map", () => {
  const a = artifact();
  assert.deepEqual(
    [...taxonomy(a, "whirlpool_hop_form")].sort(),
    Object.keys(PRODUCT_FORM_UTILIZATION).sort()
  );
});

test("ion taxonomy covers the UI pin set", () => {
  const a = artifact();
  assert.deepEqual([...taxonomy(a, "ion")].sort(), WATER_IONS.map((row) => row.pin).sort());
});


test("every taxonomy is referenced and has unique values", () => {
  const a = artifact();
  const referenced = new Set();
  for (const node of Object.values(a.nodes)) {
    if (node.kind === "choice") referenced.add(node.taxonomy);
    if (node.kind === "derived" && node.output?.taxonomy) referenced.add(node.output.taxonomy);
    if (node.kind === "boundary") {
      for (const output of Object.values(node.outputs ?? {})) {
        if (output.taxonomy) referenced.add(output.taxonomy);
      }
    }
  }
  for (const schema of Object.values(a.primitive_schemas)) {
    for (const spec of Object.values(schema)) {
      if (spec.taxonomy) referenced.add(spec.taxonomy);
    }
  }

  for (const [id, values] of Object.entries(a.taxonomies)) {
    assert.ok(referenced.has(id), `taxonomy "${id}" is not referenced by any choice or schema field`);
    assert.deepEqual(
      values,
      [...new Set(values)],
      `taxonomy "${id}" has duplicate values`
    );
    assert.ok(
      values.every((value) => typeof value === "string" && value !== ""),
      `taxonomy "${id}" has an empty or non-string value`
    );
  }
});
