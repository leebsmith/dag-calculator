import { readFileSync, readdirSync, statSync } from "node:fs";
import { ROOT, read, join } from "./util.js";

export const STYLE_PATH = "frontend/src/style.css";
export const ALLOWLIST_PATH = "tests/guards/css-allowlist.json";

export function loadAllowlist() {
  return JSON.parse(read(ALLOWLIST_PATH));
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function collapse(value) {
  return value.replace(/\s+/g, " ").trim();
}

function matchingBrace(text, open, end) {
  let depth = 1;
  let quote = null;
  for (let i = open + 1; i < end; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function nextBoundary(text, start, end) {
  let paren = 0;
  let quote = null;
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (paren === 0 && (c === "{" || c === ";")) return i;
  }
  return end;
}

function parseRange(text, start, end, context, rules) {
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(text[i])) i++;
    if (i >= end) break;
    const boundary = nextBoundary(text, i, end);
    if (boundary >= end) break;
    if (text[boundary] === ";") {
      i = boundary + 1;
      continue;
    }
    const prelude = collapse(text.slice(i, boundary));
    const close = matchingBrace(text, boundary, end);
    if (close === -1) break;
    if (prelude.startsWith("@keyframes") || prelude.startsWith("@-webkit-keyframes")) {
      i = close + 1;
      continue;
    }
    if (prelude.startsWith("@media") || prelude.startsWith("@container") || prelude.startsWith("@supports")) {
      parseRange(text, boundary + 1, close, [...context, prelude], rules);
    } else if (prelude.startsWith("@")) {
      i = close + 1;
      continue;
    } else {
      const declarations = text
        .slice(boundary + 1, close)
        .split(";")
        .map(collapse)
        .filter(Boolean)
        .sort();
      if (declarations.length > 0) {
        const line = text.slice(0, i).split("\n").length;
        rules.push({ selector: collapse(prelude), declarations, context, line });
      }
    }
    i = close + 1;
  }
}

export function parseRules(css) {
  const text = stripComments(css);
  const rules = [];
  parseRange(text, 0, text.length, [], rules);
  return rules;
}

export function declarationText(rule) {
  return rule.declarations.join("; ");
}

export function duplicateGroups(rules) {
  const groups = new Map();
  for (const rule of rules) {
    const key = `${rule.context.join(" > ")}\n${declarationText(rule)}`;
    if (!groups.has(key)) groups.set(key, { context: rule.context, declarations: rule.declarations, selectors: [] });
    groups.get(key).selectors.push(rule.selector);
  }
  return [...groups.values()].filter((group) => group.selectors.length > 1);
}

export function cssClasses(rules) {
  const classes = new Set();
  for (const rule of rules) {
    for (const match of rule.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(match[1]);
  }
  return classes;
}

export function sourceTokens() {
  const files = [join(ROOT, "frontend/index.html")];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".html") || path.endsWith(".js")) files.push(path);
    }
  };
  walk(join(ROOT, "frontend/src"));
  const tokens = new Set();
  for (const file of files) {
    for (const token of readFileSync(file, "utf8").match(/[A-Za-z_][\w-]*/g) ?? []) tokens.add(token);
  }
  return tokens;
}
