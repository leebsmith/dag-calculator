import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWLIST_PATH,
  STYLE_PATH,
  declarationText,
  duplicateGroups,
  loadAllowlist,
  parseRules,
} from "./css-guard-util.js";
import { read } from "./util.js";

const sortSelectors = (selectors) => [...selectors].sort();

function entryKey(entry) {
  return `${entry.context}\n${entry.declarations}`;
}

function groupKey(group) {
  return `${group.context.join(" > ")}\n${declarationText({ declarations: group.declarations })}`;
}

test("no duplicate declaration groups outside the allowlist", () => {
  const allowlist = loadAllowlist();
  const entries = allowlist.duplicateGroups ?? [];
  const rules = parseRules(read(STYLE_PATH));
  const groups = duplicateGroups(rules);

  const entryByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const matched = new Set();
  const failures = [];

  for (const group of groups) {
    const key = groupKey(group);
    const entry = entryByKey.get(key);
    if (!entry) {
      failures.push(`unlisted duplicate group: ${group.selectors.join(", ")}`);
      continue;
    }
    matched.add(key);
    if (sortSelectors(entry.selectors).join("\n") !== sortSelectors(group.selectors).join("\n")) {
      failures.push(
        `allowlisted group changed membership: ${group.selectors.join(", ")}\n` +
          `  allowlist: ${entry.selectors.join(", ")}`
      );
    }
  }

  for (const entry of entries) {
    if (!entry.reason || !entry.reason.trim()) {
      failures.push(`allowlist entry has no reason: ${entry.selectors.join(", ")}`);
    }
    if (!matched.has(entryKey(entry))) {
      failures.push(`stale allowlist entry, remove it: ${entry.selectors.join(", ")}`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `${ALLOWLIST_PATH} is out of date:\n${failures.join("\n")}`
  );
});
