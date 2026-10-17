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
  assert.equal(states.length, 38);
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

test("fieldDomainStates covers fields of a selected component", () => {
  const e = createCalculator(artifact, makeFixtures());
  const states = e.fieldDomainStates();
  assert.ok(states.length > 0);
  assert.ok(states.every((s) => s.selectionNodeId === "equipment.profile"));
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
