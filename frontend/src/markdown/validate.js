// Advisory markdown validation for free-text fields. This module never renders
// HTML: it inspects `markdown-it` tokens and reports constructs the Typst
// renderer will degrade or refuse.

import MarkdownIt from "markdown-it";
import { ignoreError } from "../observability.js";
import { safeHref } from "../utils.js";

export const PROSE_SUBSET_VERSION = 1;
export const PROSE_MAX_SOURCE_CODE_POINTS = 20_000;
export const PROSE_MAX_NODES = 2_000;
export const PROSE_MAX_DEPTH = 32;

const MESSAGES = {
  "prose.unsupported.table": "Tables print as plain text in the PDF.",
  "prose.unsupported.image": "Images print as alt text in the PDF.",
  "prose.unsupported.html": "HTML prints as text in the PDF.",
  "prose.unsafe.link": "Only http and https links remain clickable.",
  "prose.too_long": "This note is longer than the report supports.",
  "prose.too_deep": "This note is nested more deeply than the report supports.",
  "prose.too_many_nodes": "This note has too many elements for the report.",
  "prose.check_failed": "The markdown check could not run.",
};

const DETECTION = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
});
DETECTION.validateLink = () => true;

function codePoints(text) {
  return Array.from(text).length;
}

function issue(code, line = null) {
  return { code, message: MESSAGES[code] ?? MESSAGES["prose.check_failed"], line };
}

function addIssue(found, code, line = null) {
  if (!found.has(code)) found.set(code, issue(code, line));
}

function linkDestination(token) {
  const entry = (token.attrs ?? []).find(([name]) => name === "href");
  return entry ? entry[1] : "";
}

function inspectInline(tokens, depth, state) {
  for (const token of tokens) {
    state.nodes += 1;
    state.depth = Math.max(state.depth, depth);
    if (token.type === "image") addIssue(state.found, "prose.unsupported.image");
    if (token.type === "html_inline") addIssue(state.found, "prose.unsupported.html");
    if (token.type === "link_open" && safeHref(linkDestination(token)) === "") {
      addIssue(state.found, "prose.unsafe.link");
    }
    if (token.children) inspectInline(token.children, depth + 1, state);
  }
}

function inspectTokens(tokens, state) {
  for (const token of tokens) {
    state.nodes += 1;
    state.depth = Math.max(state.depth, (token.level ?? 0) + 1);
    if (token.type === "table_open") addIssue(state.found, "prose.unsupported.table");
    if (token.type === "html_block") addIssue(state.found, "prose.unsupported.html");
    if (token.children) inspectInline(token.children, 2, state);
  }
}

function inspect(source) {
  const state = { found: new Map(), nodes: 0, depth: 0 };
  inspectTokens(DETECTION.parse(source, {}), state);
  if (state.nodes > PROSE_MAX_NODES) addIssue(state.found, "prose.too_many_nodes");
  if (state.depth > PROSE_MAX_DEPTH) addIssue(state.found, "prose.too_deep");
  return Object.freeze({
    ok: state.found.size === 0,
    issues: Object.freeze([...state.found.values()]),
  });
}

function createCache(maxEntries, maxCharacters) {
  const entries = new Map();
  let characters = 0;

  function remember(source, result) {
    const key = `${PROSE_SUBSET_VERSION}\u0000${source}`;
    entries.set(key, { source, result });
    characters += source.length;
    while (entries.size > maxEntries || characters > maxCharacters) {
      const oldest = entries.keys().next().value;
      const value = entries.get(oldest);
      characters -= value.source.length;
      entries.delete(oldest);
    }
  }

  function lookup(source) {
    const key = `${PROSE_SUBSET_VERSION}\u0000${source}`;
    const hit = entries.get(key);
    if (!hit) return null;
    entries.delete(key);
    entries.set(key, hit);
    return hit.result;
  }

  return { remember, lookup };
}

export function createProseValidator({
  reportError = ignoreError,
  maxEntries = 200,
  maxCharacters = 200_000,
} = {}) {
  const cache = createCache(maxEntries, maxCharacters);

  function validate(value) {
    const source = typeof value === "string" ? value : "";
    if (source.trim() === "") return Object.freeze({ ok: true, issues: Object.freeze([]) });
    const cached = cache.lookup(source);
    if (cached) return cached;
    if (codePoints(source) > PROSE_MAX_SOURCE_CODE_POINTS) {
      const result = Object.freeze({ ok: false, issues: Object.freeze([issue("prose.too_long")]) });
      cache.remember(source, result);
      return result;
    }
    let result;
    try {
      result = inspect(source);
    } catch (err) {
      reportError("prose.validate", err);
      result = Object.freeze({
        ok: false,
        issues: Object.freeze([issue("prose.check_failed")]),
      });
    }
    cache.remember(source, result);
    return result;
  }

  return { validate };
}
