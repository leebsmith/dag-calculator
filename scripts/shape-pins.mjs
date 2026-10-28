// The shape pins in `eslint.config.js` are ceilings recorded at the count the
// linter reported on the day they landed. A ceiling alone cannot tell you when a
// file improved, so a pin can stay loose forever after the split that fixed it.
// This module re-measures each pinned file with the rules at threshold 1 (every
// function reports its actual count) and reports the headroom, so `make test`
// fails until the pin is lowered to the truth.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import config from "../eslint.config.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ESLINT = join(ROOT, "frontend/node_modules/.bin/eslint");

export const SHAPE_RULES = [
  "complexity",
  "max-depth",
  "max-lines-per-function",
  "max-lines",
  "max-params",
  "max-statements",
];

// Only `shape-pin:` entries are ratcheted: each is one file's reported count. The
// grouped `shape-group:` exceptions (one ceiling shared by every installer, on
// purpose) are caps, not pins, so a per-file actual has nothing to compare
// against.
export function declaredPins(entries = config) {
  const pins = {};
  for (const entry of entries) {
    if (typeof entry?.name !== "string" || !entry.name.startsWith("shape-pin:")) continue;
    if (!Array.isArray(entry.files)) continue;
    for (const file of entry.files.filter(isPinnedFile)) {
      for (const [rule, ceiling] of pinRules(entry.rules)) {
        pins[file] ??= {};
        pins[file][rule] = ceiling;
      }
    }
  }
  return pins;
}

function isPinnedFile(file) {
  return !/[*?]/.test(file) && existsSync(join(ROOT, file));
}

function pinRules(rules = {}) {
  return Object.entries(rules)
    .filter(([rule, setting]) => SHAPE_RULES.includes(rule) && Array.isArray(setting))
    .map(([rule, setting]) => [rule, setting[1]]);
}

function reportedNumber(message) {
  const paren = message.match(/\((\d+)\)/);
  if (paren) return Number(paren[1]);
  const complexity = message.match(/complexity of (\d+)/);
  return complexity ? Number(complexity[1]) : null;
}

export function actuals(messages) {
  const out = {};
  for (const message of messages) {
    if (!SHAPE_RULES.includes(message.ruleId)) continue;
    const reported = reportedNumber(message.message);
    if (reported === null) continue;
    out[message.ruleId] = Math.max(out[message.ruleId] ?? 0, reported);
  }
  return out;
}

export function pinDrift(pins, measured) {
  const drift = [];
  for (const [file, rules] of Object.entries(pins)) {
    for (const [rule, pin] of Object.entries(rules)) {
      const actual = measured[file]?.[rule] ?? 0;
      if (actual === pin) continue;
      drift.push({ file, rule, pin, actual, kind: actual > pin ? "over" : "stale" });
    }
  }
  return drift;
}

export function measure(pins = declaredPins()) {
  const files = Object.keys(pins);
  if (files.length === 0) return {};
  const rules = JSON.stringify(
    Object.fromEntries(SHAPE_RULES.map((rule) => [rule, ["error", 1]]))
  );
  let raw;
  try {
    raw = execFileSync(
      ESLINT,
      ["--config", "eslint.config.js", "--rule", rules, "--format", "json", ...files],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (error) {
    // The rules at threshold 1 report every function, so the exit code is 1 by
    // construction; the JSON on stdout is the measurement.
    if (typeof error.stdout !== "string") throw error;
    raw = error.stdout;
  }
  const measured = {};
  for (const result of JSON.parse(raw)) {
    measured[result.filePath.slice(ROOT.length)] = actuals(result.messages);
  }
  return measured;
}

function main() {
  const pins = declaredPins();
  const measured = measure(pins);
  const drift = pinDrift(pins, measured);
  if (drift.length === 0) {
    console.log(`shape pins: ${Object.keys(pins).length} files, every pin matches its file`);
    return;
  }
  console.error("shape pins: failing");
  for (const { file, rule, pin, actual, kind } of drift) {
    const advice = kind === "over" ? "the pin is below the file; raise it or split the function" : "lower the pin";
    console.error(`  - ${file} ${rule}: pinned ${pin}, actual ${actual} — ${advice}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
