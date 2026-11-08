import test from "node:test";
import assert from "node:assert/strict";

import { createFieldAttribution } from "../../frontend/src/adapters/fieldAttribution.js";
import { inheritedSource } from "../../frontend/src/views/producer/provenance.js";
import { steps } from "../../frontend/src/views/steps.js";
import { loadArtifact } from "./helpers.js";

const artifact = loadArtifact();

test("inheritedSource reads Jexl defaults for identity and selection roots", () => {
  assert.deepEqual(inheritedSource(artifact, "batch.hlt_starting_volume_l"), {
    kind: "identity",
    id: "equipment",
  });
  assert.deepEqual(inheritedSource(artifact, "batch.boil_off_rate_l_per_hr"), {
    kind: "identity",
    id: "equipment",
  });
  assert.deepEqual(inheritedSource(artifact, "batch.target_abv"), {
    kind: "identity",
    id: "style",
  });
  assert.deepEqual(inheritedSource(artifact, "water.target.calcium_ca"), {
    kind: "selection",
    id: "water.target_profile",
  });
});

test("inheritedSource returns null for a literal default", () => {
  assert.equal(inheritedSource(artifact, "batch.whirlpool_ambient_temp_c"), null);
});

test("relationSlices extracts Jexl predicate paths", () => {
  const attribution = createFieldAttribution(artifact, steps);

  const hlt = artifact.relations.find((relation) => relation.id === "hlt_not_overfilled");
  assert.deepEqual([...attribution.relationSlices(hlt.predicate)].sort(), ["batch", "equipment"]);

  const mash = artifact.relations.find((relation) => relation.id === "mash_tun_not_overfilled");
  assert.ok(attribution.relationSlices(mash.predicate).has("mash"));

  for (const relation of artifact.relations) {
    assert.ok(
      attribution.relationSlices(relation.predicate).size > 0,
      `${relation.id} has no slice`
    );
  }
});
