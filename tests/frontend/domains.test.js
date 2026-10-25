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
  assert.equal(states.length, 24);
});

test("default values satisfy their domains or are unresolved", () => {
  const states = createCalculator(artifact, makeFixtures()).domainStates();
  for (const s of states) {
    assert.notEqual(s.holds, false, `${s.nodeId} should not violate its domain by default`);
    if (s.holds === null) assert.equal(s.reason, "unresolved");
  }
});

test("checkDomain() flags out-of-range values", () => {
  assert.equal(checkDomain(artifact, "batch.target_abv", 0, noRef).holds, false); // gt 0
  assert.equal(checkDomain(artifact, "batch.target_abv", 5.5, noRef).holds, true);
  assert.equal(checkDomain(artifact, "batch.attenuation_derate_points", -0.01, noRef).holds, false); // gte 0
  assert.equal(checkDomain(artifact, "batch.attenuation_derate_points", 0.26, noRef).holds, false); // lte 0.25
  assert.equal(checkDomain(artifact, "batch.attenuation_derate_points", 0.04, noRef).holds, true);
  assert.equal(checkDomain(artifact, "batch.attenuation_derate_points", 0, noRef).holds, true);
  assert.equal(checkDomain(artifact, "water.target_mash_ph", 8.0, noRef).holds, false); // lte 7
  assert.equal(checkDomain(artifact, "water.target_mash_ph", 5.4, noRef).holds, true);
});

test("checkDomain() reports non-finite values as unbounded-but-failing", () => {
  const r = checkDomain(artifact, "batch.target_abv", Number.NaN, noRef);
  assert.equal(r.holds, false);
  assert.equal(r.reason, "non-finite");
});

test("checkDomain() reports a missing value as unresolved, not violated", () => {
  for (const missing of [undefined, null]) {
    const r = checkDomain(artifact, "batch.target_abv", missing, noRef);
    assert.equal(r.holds, null);
    assert.equal(r.reason, "unresolved");
  }
});

test("checkDomain() on an unbounded node holds trivially", () => {
  const r = checkDomain(artifact, "batch.yeast_id", "some-id", noRef);
  assert.equal(r.bounded, false);
  assert.equal(r.holds, true);
});

test("fieldDomainStates covers identity components and remaining selections", () => {
  const e = createCalculator(artifact, makeFixtures());
  const states = e.fieldDomainStates();
  assert.ok(states.length > 0);
  assert.ok(states.some((s) => s.namespace === "equipment"));
  assert.ok(states.some((s) => s.namespace === "water.source"));
  assert.ok(states.every((s) => s.holds));
});

test("fieldDomainStates skips unset optional selections", () => {
  const e = createCalculator(artifact, makeFixtures());
  assert.equal(e.fieldDomainStates().some((s) => s.selectionNodeId === "batch.yeast"), false);
});

test("checkDomain treats an unresolvable {ref} bound as not applicable", () => {
  const a = structuredClone(artifact);
  a.nodes["batch.target_abv"].domain = { gt: 0, lt: { ref: "batch.yeast.attenuation_pct" } };
  const e = createCalculator(a, makeFixtures());
  const states = Object.fromEntries(e.domainStates().map((s) => [s.nodeId, s.holds]));
  assert.equal(states["batch.target_abv"], true); // gt:0 holds; unresolved lt is skipped
});

test("collectionDomainStates covers collection item fields (defaults valid)", () => {
  const e = createCalculator(artifact, makeFixtures());
  const states = e.collectionDomainStates();
  assert.ok(states.length > 0);
  assert.ok(states.every((s) => s.holds));
});

test("collectionDomainStates flags an out-of-range cell", () => {
  const fixtures = makeFixtures();
  fixtures.collections["grist.major_malts"][0].pct = 1.5; // > 1
  const e = createCalculator(artifact, fixtures);
  const bad = e.collectionDomainStates().filter((s) => !s.holds);
  assert.ok(bad.some((s) => s.nodeId === "grist.major_malts" && s.field === "pct"));
});
