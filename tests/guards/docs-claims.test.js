import test from "node:test";
import assert from "node:assert/strict";

import {
  claimFailures,
  claimsIn,
  isClaimDoc,
  proposedIn,
  resolves,
} from "../../scripts/docs-claims.mjs";
import { read, rel, walk } from "./util.js";

const CLAIM_DOCS = [...walk("docs", [".md"]), ...walk("plans", [".md"])].map(rel).filter(isClaimDoc);

test("every artifact path a living doc cites exists", () => {
  const failures = claimFailures(CLAIM_DOCS.map((path) => ({ path, text: read(path) })));
  assert.ok(CLAIM_DOCS.length > 0, "no claim docs found — did the scope predicate change?");
  assert.deepEqual(
    failures.map(({ path, token }) => `${path}: ${token}`),
    [],
    "a doc cites a path the artifact, the report catalog, or the bundle does not have"
  );
});

test("the claim scope skips frozen docs and archived plans", () => {
  assert.equal(isClaimDoc("docs/historical/tech-stack.md"), false);
  assert.equal(isClaimDoc("docs/adsco/style-selection-and-ion-entry.md"), false);
  assert.equal(isClaimDoc("docs/adsco/ui.md"), true);
  assert.equal(isClaimDoc("plans/archive/pin-matrix.md"), false);
  assert.equal(isClaimDoc("plans/warnings.md"), true);
});

test("a renamed node stops resolving", () => {
  const claims = new Set(["batch.target_ibu"]);
  assert.equal(resolves("batch.target_ibu", claims), true);
  assert.equal(resolves("batch.target_ibu_renamed", claims), false);
  assert.equal(resolves("batch.typo.path", claims), false);
});

test("a plan may cite only the ids it proposes", () => {
  const text = "`batch.proposed_id` and `batch.other_id`\n<!-- claims: proposed batch.proposed_id -->";
  assert.deepEqual(proposedIn(text), ["batch.proposed_id"]);
  assert.deepEqual(
    claimFailures([{ path: "plans/example.md", text }], new Set()).map(({ token }) => token),
    ["batch.other_id"]
  );
});

test("claims are backticked dotted lowercase tokens", () => {
  assert.deepEqual(claimsIn("`batch.target_ibu`, `MashTun`, and batch.bare"), ["batch.target_ibu"]);
});
