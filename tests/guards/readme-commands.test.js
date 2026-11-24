// Every `make <target>` the README cites must be a rule in the Makefile. The
// deployment and promotion sections are prose, so a renamed or removed target
// would leave a documented command that no longer runs; the README is the only
// place the sequence is written down, and nothing else checks it.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

const README = read("README.md");
const MAKEFILE = read("Makefile");

// Commands are cited in fenced blocks and inline spans. Prose stays out of
// scope, so "make sure" in a sentence is not mistaken for a target.
function citedCommands(text) {
  const contexts = [
    ...text.matchAll(/```[\s\S]*?```/g),
    ...text.matchAll(/`[^`\n]+`/g),
  ].map((match) => match[0]);
  const targets = new Set();
  for (const context of contexts) {
    for (const match of context.matchAll(/\bmake\s+([a-z][a-z0-9-]*)/g)) {
      targets.add(match[1]);
    }
  }
  return [...targets].sort();
}

function definedInMakefile(target) {
  return new RegExp(`^${target}:`, "m").test(MAKEFILE);
}

test("the README's cited make targets all exist", () => {
  const cited = citedCommands(README);

  assert.ok(cited.length >= 20, `only ${cited.length} documented command(s) found`);
  assert.deepEqual(
    cited.filter((target) => !definedInMakefile(target)),
    [],
    "the README documents a make target the Makefile does not define"
  );
});

test("the promotion runbook's steps are documented targets", () => {
  for (const target of ["promote", "promote-status", "local-dev", "clean", "save-data"]) {
    assert.ok(definedInMakefile(target), `Makefile lost the ${target} target`);
    assert.ok(
      README.includes(`make ${target}`),
      `the README no longer documents make ${target}`
    );
  }
});
