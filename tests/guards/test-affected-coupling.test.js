// The affected-suite selector is only as honest as its coupling table. A rule
// that names a suite which no longer exists silently stops running the guard it
// was written for, and a rule whose literal path moved never fires. Both fail
// here, where `make test` and `make test-guards` can see them.

import test from "node:test";
import assert from "node:assert/strict";

import { RULES, frontendSuites, resolveSuite } from "../../scripts/test-affected.mjs";
import { ROOT, existsSync, join } from "./util.js";

const SUITES = frontendSuites();

function coupledRules() {
  return RULES.filter((rule) => rule.also);
}

function literalPrefix(glob) {
  const literal = glob.split("*")[0];
  return literal.endsWith("/") ? literal.slice(0, -1) : literal;
}

test("every declared coupling names a suite that exists", () => {
  for (const rule of coupledRules()) {
    for (const name of rule.also) {
      assert.ok(
        resolveSuite(name, SUITES),
        `${rule.globs.join(", ")} names ${name}, but no ${name}.test.js exists`
      );
    }
  }
});

test("an unknown suite name resolves to nothing", () => {
  assert.equal(resolveSuite("no-such-suite", SUITES), null);
});

test("no rule names the same suite twice", () => {
  for (const rule of coupledRules()) {
    assert.equal(new Set(rule.also).size, rule.also.length, `${rule.globs.join(", ")} repeats a name`);
  }
});

test("every rule carries a reason, a lane, and at least one glob", () => {
  for (const rule of RULES) {
    assert.ok(rule.why.length > 0, `${rule.globs.join(", ")} has no reason`);
    assert.ok(rule.lanes.length > 0, `${rule.globs.join(", ")} has no lane`);
    assert.ok(rule.globs.length > 0, "a rule with no glob can never fire");
    assert.ok(rule.full || rule.also, `${rule.globs.join(", ")} neither falls back nor names suites`);
  }
});

test("every rule points at a path that exists", () => {
  for (const rule of RULES) {
    for (const glob of rule.globs) {
      const prefix = literalPrefix(glob);
      assert.ok(existsSync(join(ROOT, prefix)), `${glob} points at ${prefix}, which does not exist`);
    }
  }
});
