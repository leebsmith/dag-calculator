import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateComponent } from "../../frontend/src/store/userCatalog.js";
import { loadArtifact } from "../frontend/helpers.js";

const artifact = loadArtifact();
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/validation-cases.json", import.meta.url), "utf8")
);

// JSON cannot represent NaN; the corpus encodes it as {"__nan__": true}.
function materialize(component) {
  const out = {};
  for (const [field, value] of Object.entries(component)) {
    out[field] = value && typeof value === "object" && value.__nan__ === true ? NaN : value;
  }
  return out;
}

test("component validation matches the shared conformance corpus (JS)", () => {
  for (const { catalog, component, expected } of fixture.cases) {
    const flagged = new Set(validateComponent(artifact, catalog, materialize(component)).map((e) => e.field));
    assert.deepEqual(
      [...flagged].sort(),
      [...expected].sort(),
      `catalog=${catalog} component=${JSON.stringify(component)}`
    );
  }
});
