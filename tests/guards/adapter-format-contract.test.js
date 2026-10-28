// Phase 0 of plans/archive/decomposition-and-display-contract.md: the display contract
// is prose only outside templates, so the guard pins the layer where formatting
// happens. Phase 1 emptied the allowlist; the scope now covers the producer and
// the presentation registry as well as the adapters, because `cell.js` is the
// shared rule for views just as the barrel is for adapters. Any new violation
// fails immediately.

import test from "node:test";
import assert from "node:assert/strict";
import { read, rel, walk } from "./util.js";

const SCOPES = [
  "frontend/src/adapters",
  "frontend/src/views/producer",
  "frontend/src/views/registry",
];

const RULES = [
  {
    id: "to-fixed",
    pattern: /\btoFixed\s*\(/,
    fix: "formatWithDecimals(value, decimals) or formatQuantity(field)",
  },
  {
    id: "percent-times-100",
    pattern: /\*\s*100\b/,
    fix: "formatPercent(fraction), formatPercentValue(percent), toPercentValue(...)",
  },
  {
    id: "math-round-scale",
    pattern: /Math\.round\s*\([^;\n]*\*\s*(?:10|100|1000|1e\d+)\s*\)\s*\//,
    fix: "roundTo(value, decimals)",
  },
  {
    id: "unit-symbol-fallback",
    pattern: /\bUNIT_SYMBOLS\b\s*(?:\[|\.[A-Za-z_$])[^\n]*\?\?/,
    fix: "unitSymbol(UNIT_SYMBOLS, dimension, unitId, fallback)",
  },
];

const ALLOW = [];

function blankStatements(source) {
  return source.replace(
    /(^|\n)([ \t]*)(?:import|export)\b[^;]*?\bfrom\s*["'][^"']+["'];?/g,
    (match, lead) => lead + match.slice(lead.length).replace(/[^\n]/g, " ")
  );
}

function scan() {
  const found = new Map();
  for (const scope of SCOPES) {
    for (const abs of walk(scope, [".js"])) {
      const file = rel(abs);
      blankStatements(read(file))
        .split("\n")
        .forEach((line, index) => {
          const match = line.trim();
          if (!match || /^(\/\/|\*|\/\*)/.test(match)) return;
          const rules = RULES.filter((rule) => rule.pattern.test(match)).map((rule) => rule.id);
          if (rules.length === 0) return;
          const key = `${file}\n${match}`;
          const hit = found.get(key) ?? { file, match, rules, lines: [] };
          hit.lines.push(index + 1);
          found.set(key, hit);
        });
    }
  }
  return found;
}

function keyOf(entry) {
  return `${entry.file}\n${entry.match}`;
}

function allowlistByKey() {
  const byKey = new Map();
  for (const entry of ALLOW) {
    byKey.set(keyOf(entry), entry);
  }
  return byKey;
}

test("formatting routes through the utils barrel or the cell rule", () => {
  const allow = allowlistByKey();
  const unlisted = [...scan().values()].filter((hit) => !allow.has(keyOf(hit)));

  const failures = unlisted.map(
    (hit) =>
      `unlisted formatting site: ${hit.file}:${hit.lines.join(",")} ` +
      `[${hit.rules.join(", ")}] ${hit.match}`
  );
  const fixes = [...new Set(unlisted.flatMap((hit) => hit.rules))].map(
    (id) => RULES.find((rule) => rule.id === id).fix
  );
  assert.deepEqual(
    failures,
    [],
    `${failures.join("\n")}\n\nUse instead:\n${fixes.map((fix) => `- ${fix}`).join("\n")}`
  );
});

test("every adapter-format allowlist entry is current and reasoned", () => {
  const violations = scan();
  const entries = allowlistByKey();
  const failures = [];

  if (entries.size !== ALLOW.length) {
    failures.push("duplicate allowlist entry; one entry covers every occurrence");
  }

  for (const [key, entry] of entries) {
    if (!entry.reason || !entry.reason.trim()) {
      failures.push(`allowlist entry has no reason: ${entry.file}: ${entry.match}`);
    }
    const hit = violations.get(key);
    const listed = entry.occurrences ?? 1;
    if (!hit) {
      failures.push(`stale allowlist entry, remove it: ${entry.file}: ${entry.match}`);
    } else if (hit.lines.length !== listed) {
      failures.push(
        `allowlisted site changed multiplicity (${listed} listed, ` +
          `${hit.lines.length} found): ${entry.file}: ${entry.match}`
      );
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the rules still catch the constructs they describe", () => {
  const samples = [
    ["to-fixed", "`${value.toFixed(1)} %`"],
    ["percent-times-100", "`${(row.alpha_acid_pct * 100).toFixed(1)}%`"],
    ["math-round-scale", "return String(Math.round(fraction * 1000) / 10);"],
    ["math-round-scale", "const target = Math.round(numeric * 10) / 10;"],
    ["unit-symbol-fallback", "`${UNIT_SYMBOLS.mass?.[unit] ?? unit}`"],
    ["unit-symbol-fallback", "unit: UNIT_SYMBOLS[dimension]?.[unit] ?? unit,"],
  ];
  for (const [id, sample] of samples) {
    const rule = RULES.find((candidate) => candidate.id === id);
    assert.ok(rule, `no rule named ${id}`);
    assert.ok(rule.pattern.test(sample), `rule ${id} no longer matches ${sample}`);
  }
  const symbolRule = RULES.find((rule) => rule.id === "unit-symbol-fallback");
  assert.equal(
    symbolRule.pattern.test('unitSymbol(UNIT_SYMBOLS, "mass", unit)'),
    false,
    "the barrel helper is the fix, not a violation"
  );
  assert.equal(
    symbolRule.pattern.test('unitSymbol(UNIT_SYMBOLS, dimension, unitId) : meta.unit ?? null'),
    false,
    "the helper's own call is not an inline fallback"
  );
});
