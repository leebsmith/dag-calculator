import test from "node:test";
import assert from "node:assert/strict";

import { checkDomain, createCalculator } from "../../frontend/src/engine/index.js";
import { loadArtifact as readArtifact, makeFixtures } from "./helpers.js";

const artifact = readArtifact();
const noRef = () => undefined;

test("domainStates() covers every bounded root/choice node", () => {
  const states = createCalculator(artifact, makeFixtures()).domainStates();
  const expected = Object.values(artifact.nodes).filter(
    (n) => (n.kind === "root" || n.kind === "choice") && n.domain
  ).length;
  assert.equal(states.length, expected);
  assert.equal(states.length, 23);
});

test("default values satisfy their domains", () => {
  const states = createCalculator(artifact, makeFixtures()).domainStates();
  for (const s of states) {
    assert.equal(s.holds, true, `${s.nodeId} should satisfy its domain`);
  }
});

test("checkDomain() flags out-of-range values", () => {
  assert.equal(checkDomain(artifact, "batch.target_abv", 0, noRef).holds, false); // gt 0
  assert.equal(checkDomain(artifact, "batch.target_abv", 5.5, noRef).holds, true);
  assert.equal(checkDomain(artifact, "batch.apparent_attenuation", 1.5, noRef).holds, false); // lte 1
  assert.equal(checkDomain(artifact, "batch.apparent_attenuation", 0.75, noRef).holds, true);
  assert.equal(checkDomain(artifact, "water.target_mash_ph", 8.0, noRef).holds, false); // lte 7
  assert.equal(checkDomain(artifact, "water.target_mash_ph", 5.4, noRef).holds, true);
});

test("checkDomain() reports non-finite values as unbounded-but-failing", () => {
  const r = checkDomain(artifact, "batch.target_abv", Number.NaN, noRef);
  assert.equal(r.holds, false);
  assert.equal(r.reason, "non-finite");
});

test("checkDomain() on an unbounded node holds trivially", () => {
  const r = checkDomain(artifact, "batch.yeast_id", "some-id", noRef);
  assert.equal(r.bounded, false);
  assert.equal(r.holds, true);
});
