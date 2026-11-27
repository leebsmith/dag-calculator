import test from "node:test";
import assert from "node:assert/strict";

import { parseRules } from "./css-guard-util.js";
import { read, rel, walk } from "./util.js";

const SPACING = {
  control: new Set(["1", "2", "3"]),
  group: new Set(["2", "3", "4", "6"]),
  layout: new Set(["4", "6", "8", "12"]),
  overlay: new Set(["4", "6", "8", "12"]),
  utility: new Set(["1", "2", "3", "4", "6", "8", "12"]),
};
const RADIUS = {
  control: new Set(["sm", "full"]),
  group: new Set(["xl", "full"]),
  layout: new Set(["xl", "full"]),
  overlay: new Set(["xl", "full"]),
  utility: new Set(["sm", "xl", "full"]),
};
const TYPE = new Set(["xs", "sm", "base", "lg"]);
const TYPE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "smaller", "larger"]);
const SPACING_PROPERTY = /^(gap|row-gap|column-gap|padding|padding-[a-z-]+|margin|margin-[a-z-]+)$/;
const COLOR_PROPERTY = /^(color|background|background-color|border|border-[a-z-]+|outline|outline-color|fill|stroke)$/;
const STATUS_TOKEN = /^(danger|error|warning|success|info)/;
const STATE_SELECTOR = /status|badge|finding|violation|error|warning|success|danger|invalid/;

function roleOf(path) {
  if (path.includes("/styles/tokens/") || path.endsWith("/style.css")) return "exempt";
  if (/\/styles\/components\/control-[^/]+\.css$/.test(path)) return "control";
  if (/\/styles\/components\/group-[^/]+\.css$/.test(path)) return "group";
  if (/\/styles\/components\/overlay-[^/]+\.css$/.test(path)) return "overlay";
  if (/\/styles\/layout\/[^/]+\.css$/.test(path)) return "layout";
  if (/\/styles\/utilities\/[^/]+\.css$/.test(path)) return "utility";
  return "unknown";
}

function refs(value) {
  return [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]);
}

function microContext(selector) {
  return /eyebrow|badge|\bth\b/.test(selector);
}

function failures(files) {
  const found = [];
  for (const { path, text } of files) {
    const role = roleOf(path);
    if (role === "exempt") continue;
    if (role === "unknown") {
      found.push(`${path}: no declared file role`);
      continue;
    }
    for (const rule of parseRules(text)) {
      for (const declaration of rule.declarations) {
        const split = declaration.indexOf(":");
        if (split < 0) continue;
        const property = declaration.slice(0, split).trim();
        const value = declaration.slice(split + 1).trim();
        const variables = refs(value);

        if (SPACING_PROPERTY.test(property)) {
          for (const name of variables) {
            if (!name.startsWith("--space-")) continue;
            if (!SPACING[role].has(name.slice("--space-".length))) {
              found.push(`${path}:${rule.line}: ${property} uses ${name} outside the ${role} band`);
            }
          }
        }

        if (property === "border-radius") {
          for (const name of variables) {
            if (!name.startsWith("--radius-")) continue;
            if (!RADIUS[role].has(name.slice("--radius-".length))) {
              found.push(`${path}:${rule.line}: ${property} uses ${name} outside the ${role} radii`);
            }
          }
        }

        if (property === "box-shadow") {
          const raised = variables.some((name) => name === "--sys-shadow-lg");
          const other = variables.filter(
            (name) => name.startsWith("--sys-shadow-") && name !== "--sys-shadow-focus" && name !== "--sys-shadow-lg"
          );
          if (other.length > 0) {
            found.push(`${path}:${rule.line}: ${property} uses ${other[0]} outside the overlay`);
          }
          if (raised && role !== "overlay") {
            found.push(`${path}:${rule.line}: ${property} uses the raised shadow outside an overlay`);
          }
          if (variables.length === 0 && value !== "none") {
            found.push(`${path}:${rule.line}: ${property} is a raw shadow`);
          }
        }

        if (property === "font-size") {
          if (variables.length === 0) {
            if (!TYPE_KEYWORDS.has(value)) {
              found.push(`${path}:${rule.line}: ${property} is not a text token`);
            }
          }
          for (const name of variables) {
            if (!name.startsWith("--text-")) continue;
            const token = name.slice("--text-".length);
            if (token === "micro") {
              if (!microContext(rule.selector)) {
                found.push(`${path}:${rule.line}: 11px type outside an eyebrow, badge or th`);
              }
              continue;
            }
            if (!TYPE.has(token)) {
              found.push(`${path}:${rule.line}: ${property} uses ${name}`);
            }
          }
        }

        if (COLOR_PROPERTY.test(property)) {
          const status = variables.find((name) => STATUS_TOKEN.test(name.slice("--sys-color-".length)));
          if (status && !STATE_SELECTOR.test(rule.selector)) {
            found.push(`${path}:${rule.line}: ${status} outside a state selector`);
          }
        }
      }
    }
  }
  return found;
}

function roleFiles() {
  return walk("frontend/src/styles", [".css"])
    .map(rel)
    .filter((path) => !path.includes("/styles/tokens/"))
    .map((path) => ({ path, text: read(path) }));
}

test("role files obey the visual grammar", () => {
  assert.deepEqual(failures(roleFiles()), []);
});

test("a control cannot borrow a group spacing step", () => {
  const path = "frontend/src/styles/components/control-input.css";
  assert.deepEqual(
    failures([{ path, text: ".control { gap: var(--space-6); }" }]),
    [`${path}:1: gap uses --space-6 outside the control band`]
  );
});

test("a group cannot use a retired radius", () => {
  const path = "frontend/src/styles/components/group-fieldset.css";
  assert.deepEqual(
    failures([{ path, text: ".fieldset { border-radius: var(--radius-md); }" }]),
    [`${path}:1: border-radius uses --radius-md outside the group radii`]
  );
});

test("only an overlay may carry the raised shadow", () => {
  const path = "frontend/src/styles/layout/wall.css";
  assert.deepEqual(
    failures([{ path, text: ".wall { box-shadow: var(--sys-shadow-lg); }" }]),
    [`${path}:1: box-shadow uses the raised shadow outside an overlay`]
  );
});

test("11px type is confined to eyebrows, badges and table headers", () => {
  const path = "frontend/src/styles/components/control-field.css";
  assert.deepEqual(
    failures([{ path, text: ".value { font-size: var(--text-micro); }" }]),
    [`${path}:1: 11px type outside an eyebrow, badge or th`]
  );
  assert.deepEqual(
    failures([{ path, text: ".eyebrow { font-size: var(--text-micro); }" }]),
    []
  );
});

test("status colour is confined to state selectors", () => {
  const path = "frontend/src/styles/components/group-card.css";
  assert.deepEqual(
    failures([{ path, text: ".title { color: var(--sys-color-danger-text); }" }]),
    [`${path}:1: --sys-color-danger-text outside a state selector`]
  );
  assert.deepEqual(
    failures([{ path, text: ".badge { color: var(--sys-color-danger-text); }" }]),
    []
  );
});

test("a file without a role fails", () => {
  const path = "frontend/src/styles/misc.css";
  assert.deepEqual(failures([{ path, text: ".x { color: red; }" }]), [`${path}: no declared file role`]);
});
