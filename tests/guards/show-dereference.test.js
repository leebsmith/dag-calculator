import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

// A10: `x-show` only hides the element; Alpine still initializes and evaluates
// its subtree. A nullable object used as a visibility flag must therefore not be
// dereferenced by an evaluated directive unless that expression guards it (or an
// enclosing x-if does). `x-if` is the safe wrapper for null-until-ready cards.

const FILES = [
  "frontend/index.html",
  ...walk("frontend/src/partials", [".html"]).map(rel),
];

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const EVALUATED = /^(x-text|x-html|x-for|x-model|x-init|x-effect|x-show|x-if|:|x-bind:)/;

function attrsOf(source) {
  const out = [];
  for (const m of source.matchAll(ATTR)) out.push([m[1], m[2] ?? m[3] ?? ""]);
  return out;
}

function isGuarded(expression, ident) {
  const id = ident.replace(/[$]/g, "\\$");
  return new RegExp(`(?:${id}\\s*(?:&&|\\|\\||\\?|===|!==|==|!=)|!\\s*${id}\\b)`).test(expression);
}

test("A10: nullable x-show flags are not dereferenced by evaluated directives", () => {
  const offenders = [];

  for (const file of FILES) {
    const html = read(file);
    const stack = []; // { tag, shows: Set, guards: Set }

    for (const m of html.matchAll(TAG)) {
      const closing = m[1] === "/";
      const tag = m[2].toLowerCase();
      const selfClosing = /\/\s*$/.test(m[3]) || VOID.has(tag);

      if (closing) {
        while (stack.length && stack[stack.length - 1].tag !== tag) stack.pop();
        stack.pop();
        continue;
      }

      const attrs = attrsOf(m[3]);
      const shows = new Set();
      const guards = new Set();
      for (const [name, value] of attrs) {
        if (name === "x-show") {
          const flag = value.trim().replace(/^!\s*/, "");
          if (IDENT.test(flag)) shows.add(flag);
        }
        if (name === "x-if") {
          if (IDENT.test(value.trim())) guards.add(value.trim());
          const leading = value.trim().match(/^([A-Za-z_$][\w$]*)\s*&&/);
          if (leading) guards.add(leading[1]);
        }
      }

      const activeShows = new Set(shows);
      const activeGuards = new Set();
      for (const scope of stack) {
        for (const id of scope.shows) activeShows.add(id);
        for (const id of scope.guards) activeGuards.add(id);
      }
      for (const id of activeGuards) activeShows.delete(id);

      const line = html.slice(0, m.index).split("\n").length;
      for (const [name, value] of attrs) {
        if (!EVALUATED.test(name) || name === "x-if") continue;
        for (const ident of activeShows) {
          if (isGuarded(value, ident)) continue;
          if (new RegExp(`\\b${ident.replace(/[$]/g, "\\$")}\\s*\\.`).test(value)) {
            offenders.push(`${file}:${line} x-show="${ident}" -> ${name}="${value.trim()}"`);
          }
        }
      }

      if (!selfClosing) stack.push({ tag, shows, guards });
    }
  }

  assert.deepEqual(offenders, [], `nullable x-show flags dereferenced:\n${offenders.join("\n")}`);
});
