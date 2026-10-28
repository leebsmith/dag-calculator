import test from "node:test";
import assert from "node:assert/strict";

import { INSTALLERS, SHARED } from "../../frontend/src/adapters/installers.js";
import {
  buildOwnershipIndex,
  cardPartialFiles,
  ownerIndex,
  ownershipGaps,
  partialOwners,
} from "../../scripts/frontend-ownership.mjs";
import { read } from "./util.js";

const BUCKETS = [
  "duplicateShared",
  "staleShared",
  "undeclared",
  "missingModules",
  "missingPartials",
  "unownedPartials",
  "shellPartials",
];

function reported(gaps) {
  return Object.fromEntries(
    BUCKETS.filter((bucket) => gaps[bucket].length).map((bucket) => [bucket, gaps[bucket]])
  );
}

test("every cross-owner read is declared and every SHARED entry is used", () => {
  assert.deepEqual(reported(ownershipGaps(INSTALLERS, SHARED)), {}, "ownership drift");
});

test("the ownership index is current", () => {
  assert.equal(read("docs/frontend-ownership.md"), buildOwnershipIndex());
});

test("every app member has exactly one owner", () => {
  const owners = ownerIndex(INSTALLERS);
  const declared = INSTALLERS.flatMap(({ keys }) => keys);
  assert.equal(owners.size, declared.length, "a key is declared by two installers");
});

test("every card partial is owned and every declared partial exists", () => {
  const owners = partialOwners(INSTALLERS);
  assert.deepEqual(
    cardPartialFiles().filter((partial) => !owners.has(partial)),
    []
  );
  assert.deepEqual(
    [...owners.keys()].filter((partial) => !cardPartialFiles().includes(partial)),
    []
  );
});

test("a foreign read fails when its SHARED entry is dropped", () => {
  const gaps = ownershipGaps(
    INSTALLERS,
    SHARED.filter((entry) => entry.key !== "dialogFocus")
  );
  assert.ok(
    gaps.undeclared.some((message) => message.includes("dialogFocus")),
    `expected an undeclared dialogFocus read, got ${JSON.stringify(gaps.undeclared)}`
  );
});

test("a partial binding fails when its SHARED entry is dropped", () => {
  const gaps = ownershipGaps(
    INSTALLERS,
    SHARED.filter((entry) => entry.key !== "inputKey")
  );
  assert.ok(
    gaps.undeclared.some((message) => message.startsWith("styleTargets reads inputKey")),
    `expected an undeclared inputKey read, got ${JSON.stringify(gaps.undeclared)}`
  );
});

test("a stale SHARED reader fails", () => {
  const gaps = ownershipGaps(
    INSTALLERS,
    SHARED.map((entry) =>
      entry.key === "scalePinLabel" ? { ...entry, owners: [...entry.owners, "yeast"] } : entry
    )
  );
  assert.deepEqual(gaps.staleShared, ["scalePinLabel: declares yeast, which no longer reads it"]);
});

test("a SHARED entry with no reason fails", () => {
  const gaps = ownershipGaps(
    INSTALLERS,
    SHARED.map((entry) => (entry.key === "scalePinLabel" ? { ...entry, reason: "" } : entry))
  );
  assert.ok(gaps.staleShared.some((message) => message.includes("missing a reason")));
});

test("a SHARED entry for an unknown member fails", () => {
  const gaps = ownershipGaps(INSTALLERS, [
    ...SHARED,
    { key: "notAMember", owners: ["hop"], reason: "invented for the test" },
  ]);
  assert.ok(gaps.staleShared.includes("notAMember: not declared by any installer"));
});
