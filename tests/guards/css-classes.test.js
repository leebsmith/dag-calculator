import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWLIST_PATH,
  STYLE_PATH,
  cssClasses,
  loadAllowlist,
  parseRules,
  sourceTokens,
} from "./css-guard-util.js";
import { read } from "./util.js";

test("no unreferenced classes outside the allowlist", () => {
  const allowlist = loadAllowlist();
  const entries = allowlist.classes ?? [];
  const prefixes = allowlist.safelistPrefixes ?? [];
  const classes = cssClasses(parseRules(read(STYLE_PATH)));
  const tokens = sourceTokens();

  const entryByClass = new Map(entries.map((entry) => [entry.class, entry]));
  const matched = new Set();
  const failures = [];

  for (const name of classes) {
    if (tokens.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) continue;
    const entry = entryByClass.get(name);
    if (!entry) {
      failures.push(`unreferenced class: .${name}`);
      continue;
    }
    matched.add(name);
  }

  for (const entry of entries) {
    if (!entry.reason || !entry.reason.trim()) {
      failures.push(`allowlist entry has no reason: .${entry.class}`);
    }
    if (!classes.has(entry.class)) {
      failures.push(`stale allowlist entry, .${entry.class} is not in the stylesheet`);
    } else if (tokens.has(entry.class)) {
      failures.push(`stale allowlist entry, .${entry.class} is now referenced`);
    } else if (!matched.has(entry.class)) {
      failures.push(`stale allowlist entry, .${entry.class} is safelisted`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `${ALLOWLIST_PATH} is out of date:\n${failures.join("\n")}`
  );
});
