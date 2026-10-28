// Phase 0 of plans/decomposition-and-display-contract.md: the display contract
// is prose only outside templates, but the adapters are where most formatting
// happens. Every numeric readout must come from the utils barrel; today's
// violations are baselined below with a reason and fail the guard when stale.

import test from "node:test";
import assert from "node:assert/strict";
import { read, rel, walk } from "./util.js";

const SCOPE = "frontend/src/adapters";

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
    pattern: /Math\.round\s*\([^;\n]*\*\s*(?:1000|1e6)\s*\)\s*\//,
    fix: "roundTo(value, decimals)",
  },
  {
    id: "unit-symbol-fallback",
    pattern: /\bUNIT_SYMBOLS\b/,
    fix: "unitSymbol(UNIT_SYMBOLS, dimension, unitId, fallback)",
  },
];

const ALLOW = [
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return `${value.toFixed(unitDecimals(\"mass\", unit))} ${UNIT_SYMBOLS.mass?.[unit] ?? unit}`;",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return `${formatWithDecimals(value, 1)} ${UNIT_SYMBOLS.temperature?.[unitId] ?? unitId}`;",
    reason: "Phase 1: inline symbol fallback; use unitSymbol(...).",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "? `${(row.alpha_acid_pct * 100).toFixed(1)}%`",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "? Number((row.alpha_acid_pct * 100).toFixed(2))",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return `stock ${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}%`;",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "? `${Math.round(row.boil_time_fraction * 100)}%`",
    reason: "Phase 1: inline percent math; use formatPercent/toPercentValue.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return typeof row?.minutes === \"number\" ? `${row.minutes.toFixed(0)} min` : \"—\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return typeof row?.ibu === \"number\" ? row.ibu.toFixed(1) : \"—\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "return typeof row?.pct === \"number\" ? `${(row.pct * 100).toFixed(1)}%` : \"—\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/hops.js",
    match: "? `Flowable extract dose ${worst.toFixed(2)} g/gal exceeds the 4 g/gal saturation ceiling.`",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/late-additions.js",
    match: "return Math.round((Number(value) || 0) * 1e6) / 1e6;",
    reason: "Phase 1: inline scale-and-divide rounding; use roundTo.",
  },
  {
    file: "frontend/src/adapters/cards/malt.js",
    match: "const total = Number((this.maltTotalPct * 100).toFixed(1));",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/malt.js",
    match: "const remaining = (100 - total).toFixed(1);",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/malt.js",
    match: "label: `${total.toFixed(1)}% (Remaining ${remaining}%)`,",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/malt.js",
    match: "const excess = (total - 100).toFixed(1);",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/malt.js",
    match: "label: `${total.toFixed(1)}% (Excess +${excess}%)`,",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/mash.js",
    match: "return Number.isFinite(v) ? v.toFixed(1) : \"\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/mash.js",
    match: "return UNIT_SYMBOLS.temperature[unitId] ?? unitId;",
    reason: "Phase 1: inline symbol fallback; use unitSymbol(...).",
  },
  {
    file: "frontend/src/adapters/cards/mash.js",
    match: "return Number.isFinite(d) ? d.toFixed(1) : \"\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/mash.js",
    match: "return unitSymbol(UNIT_SYMBOLS, \"mash_thickness\", this.mashThicknessUnitId) ?? this.mashThicknessUnitId;",
    reason: "Phase 1: inline symbol fallback; use unitSymbol(...).",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "const px = (value) => sx(value).toFixed(1);",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "const py = (value) => sy(value).toFixed(1);",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "pinLabelAt = { x: (x + 4).toFixed(1), y: top + 12, anchor: \"start\" };",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "pinLabelAt = { x: right - 4, y: (y - 4).toFixed(1), anchor: \"end\" };",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "y: (sy(topMost[1]) + 12).toFixed(1),",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "y: (sy(value) + 3).toFixed(1),",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "return typeof this.ibuGu === \"number\" ? this.ibuGu.toFixed(2) : \"—\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "return typeof fraction === \"number\" ? Math.round(fraction * 100) : 0;",
    reason: "Phase 1: inline percent math; use formatPercent/toPercentValue.",
  },
  {
    file: "frontend/src/adapters/cards/style.js",
    match: "return typeof ibu === \"number\" ? ibu.toFixed(1) : \"—\";",
    reason: "Phase 1: inline decimals; use formatWithDecimals/formatQuantity.",
    occurrences: 2,
  },
  {
    file: "frontend/src/adapters/cards/yeast.js",
    match: "const formatPercent = (f) => (typeof f === \"number\" ? String(Math.round(f * 1000) / 10) : \"\");",
    reason: "Phase 1: inline scale-and-divide rounding; use roundTo.",
  },
  {
    file: "frontend/src/adapters/cards/yeast.js",
    match: "const p = pct * 100;",
    reason: "Phase 1: inline percent math; use formatPercent/toPercentValue.",
  },
  {
    file: "frontend/src/adapters/draftEditor.js",
    match: "return unitSymbol(UNIT_SYMBOLS, \"grain_color\", unitId) ?? unitId;",
    reason: "Phase 1: inline symbol fallback; use unitSymbol(...).",
  },
  {
    file: "frontend/src/adapters/libraryUi.js",
    match: "symbol: UNIT_SYMBOLS[spec.dimension]?.[unitId] ?? unitId,",
    reason: "Phase 1: inline symbol fallback; use unitSymbol(...).",
  },
];

function blankStatements(source) {
  return source.replace(
    /(^|\n)([ \t]*)(?:import|export)\b[^;]*?\bfrom\s*["'][^"']+["'];?/g,
    (match, lead) => lead + match.slice(lead.length).replace(/[^\n]/g, " ")
  );
}

function scan() {
  const found = new Map();
  for (const abs of walk(SCOPE, [".js"])) {
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

test("adapters format through the utils barrel only", () => {
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
    ["unit-symbol-fallback", "`${UNIT_SYMBOLS.mass?.[unit] ?? unit}`"],
  ];
  for (const [id, sample] of samples) {
    const rule = RULES.find((candidate) => candidate.id === id);
    assert.ok(rule, `no rule named ${id}`);
    assert.ok(rule.pattern.test(sample), `rule ${id} no longer matches ${sample}`);
  }
});
