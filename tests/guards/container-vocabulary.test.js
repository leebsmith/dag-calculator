import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";
import { STYLE_PATH, parseRules } from "./css-guard-util.js";

const REGISTRY_PATH = "tests/guards/container-recipes.json";

const CONTAINER = /(^|-)(card|panel|sheet|region|section)(--[a-z0-9-]+)?$/;
const EXEMPT = new Set(["extract-region"]);

const APPROVED = new Set([
  "card",
  "card-section",
  "card-section--collapsible",
  "region",
  "region--divided",
  "region--spaced",
  "sheet",
  "sheet--library",
  "sheet--signin",
  "catalog-item-card",
  "detail-panel",
]);

const SECTION_BLOCKS = new Set([
  "card",
  "card-section",
  "card-section--collapsible",
  "region",
  "region--divided",
  "region--spaced",
  "sheet",
  "sheet--library",
  "sheet--signin",
]);

const MODIFIER_BASE = new Map([
  ["card-section--collapsible", "card-section"],
  ["region--divided", "region"],
  ["region--spaced", "region"],
  ["sheet--library", "sheet"],
  ["sheet--signin", "sheet"],
]);

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "path",
  "circle",
  "line",
  "rect",
  "polyline",
  "polygon",
  "stop",
  "use",
]);

function openingTags(text) {
  const tags = [];
  const stack = [];
  let i = 0;
  let line = 1;

  const advance = (to) => {
    for (let k = i; k < to; k++) if (text[k] === "\n") line++;
    i = to;
  };

  while (i < text.length) {
    if (text[i] === "<" && text[i + 1] === "/") {
      const close = text.indexOf(">", i);
      if (close === -1) break;
      const name = text.slice(i + 2, close).trim();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      advance(close + 1);
      continue;
    }

    if (text[i] === "<" && /[a-zA-Z]/.test(text[i + 1] ?? "")) {
      let j = i + 1;
      let quote = null;
      while (j < text.length) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ">") {
          break;
        }
        j++;
      }
      if (j >= text.length) break;
      const raw = text.slice(i + 1, j);
      const name = (raw.match(/^[a-zA-Z][\w-]*/) ?? [""])[0];
      const selfClosing = /\/\s*$/.test(raw);
      const classAttr = (raw.match(/(?<![\w:-])class="([^"]*)"/) ?? [])[1] ?? "";
      tags.push({
        name,
        classAttr,
        classes: classAttr.split(/\s+/).filter(Boolean),
        ancestors: stack.map((entry) => ({ name: entry.name, classes: entry.classes })),
        line,
      });
      if (!selfClosing && !VOID.has(name.toLowerCase())) stack.push({ name, classes: classAttr.split(/\s+/).filter(Boolean) });
      advance(j + 1);
      continue;
    }

    advance(i + 1);
  }
  return tags;
}

function markup() {
  const files = ["frontend/index.html", ...walk("frontend/src/partials", [".html"]).map(rel)];
  return files.map((file) => ({ file, text: read(file), tags: openingTags(read(file)) }));
}

test("container classes stay inside the approved vocabulary", () => {
  const failures = [];
  for (const { file, tags } of markup()) {
    for (const tag of tags) {
      for (const token of tag.classes) {
        if (!CONTAINER.test(token)) continue;
        if (EXEMPT.has(token) || APPROVED.has(token)) continue;
        failures.push(`${file}:${tag.line}: unregistered container class ${token}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("container blocks use their contract element", () => {
  const failures = [];
  for (const { file, tags } of markup()) {
    for (const tag of tags) {
      for (const token of tag.classes) {
        if (SECTION_BLOCKS.has(token) && tag.name !== "section") {
          failures.push(`${file}:${tag.line}: ${token} must be a section, got ${tag.name}`);
        }
        if ((token === "card-section-header" || token === "card-section-actions") && tag.name !== "div") {
          failures.push(`${file}:${tag.line}: ${token} must be a div, got ${tag.name}`);
        }
        if (token === "empty-state" && tag.name !== "td" && tag.name !== "div") {
          failures.push(`${file}:${tag.line}: empty-state must be td or div, got ${tag.name}`);
        }
        if (token === "field-label" && tag.name !== "span") {
          failures.push(`${file}:${tag.line}: field-label must be a span, got ${tag.name}`);
        }
        if (token === "row-actions" && tag.name !== "div") {
          failures.push(`${file}:${tag.line}: row-actions must be a div, got ${tag.name}`);
        }
        if (token === "eyebrow" && !["h2", "h3", "h4", "span"].includes(tag.name)) {
          failures.push(`${file}:${tag.line}: eyebrow must be a heading or span, got ${tag.name}`);
        }
        if (token === "region-title") {
          const heading = ["h2", "h3", "h4"].includes(tag.name);
          const inlineHeader =
            tag.name === "span" &&
            tag.ancestors.some(
              (ancestor) =>
                (ancestor.name === "button" && ancestor.classes.includes("section-toggle")) ||
                (ancestor.name === "div" && ancestor.classes.includes("section-header"))
            );
          if (!heading && !inlineHeader) {
            failures.push(`${file}:${tag.line}: region-title must be a heading or a span inside section-toggle`);
          }
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("container modifiers carry their block", () => {
  const failures = [];
  for (const { file, tags } of markup()) {
    for (const tag of tags) {
      for (const [modifier, base] of MODIFIER_BASE) {
        if (tag.classes.includes(modifier) && !tag.classes.includes(base)) {
          failures.push(`${file}:${tag.line}: ${modifier} needs ${base}`);
        }
      }
      if (
        tag.classes.includes("sheet") &&
        !tag.classes.includes("sheet--library") &&
        !tag.classes.includes("sheet--signin")
      ) {
        failures.push(`${file}:${tag.line}: sheet needs a sheet-- library or signin modifier`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("container recipes stay pinned", () => {
  const registry = JSON.parse(read(REGISTRY_PATH));
  const rules = parseRules(read(STYLE_PATH));
  const failures = [];

  for (const entry of registry.selectors) {
    const rule = rules.find((candidate) => candidate.selector === entry.selector);
    if (!rule) {
      failures.push(`missing selector ${entry.selector}`);
      continue;
    }
    if (JSON.stringify(rule.declarations) !== JSON.stringify(entry.declarations)) {
      failures.push(`recipe changed: ${entry.selector}`);
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});
