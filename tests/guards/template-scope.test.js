// Template-scope guard: Alpine evaluates an `x-for` alias only inside that
// element's subtree. A reference from a sibling or ancestor scope does not fail
// loudly — Alpine catches the `ReferenceError` and reports an expression error
// per binding, flooding the console while the page still renders. Every alias a
// partial uses must therefore be declared by an enclosing `x-for` (or by the
// `x-for` on the element itself, which owns its `:key` and handler bindings).

import test from "node:test";
import assert from "node:assert/strict";

import { read, rel, walk } from "./util.js";

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
const ALIAS = /^\s*\(?([^)]*?)\)?\s+in\s/;
const EVALUATED = /^(x-text|x-html|x-for|x-model|x-init|x-effect|x-show|x-if|:|x-bind:|@|x-on:)/;

function attrsOf(source) {
  const out = [];
  for (const m of source.matchAll(ATTR)) out.push([m[1], m[2] ?? m[3] ?? ""]);
  return out;
}

function aliasesIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/x-for="([^"]*)"/g)) {
    const parsed = m[1].match(ALIAS);
    if (parsed) for (const part of parsed[1].split(",")) out.add(part.trim());
  }
  return out;
}

// `(f) => f.id` and `row => row.id` bind their parameters inside the expression;
// reads of those names are not scope leaks. Nested arrow params are collected
// for the whole expression — a deliberate over-approximation that only weakens
// detection, never invents an offender.
function arrowBindingsIn(expression) {
  const bound = new Set();
  for (const m of expression.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of m[1].split(",")) bound.add(part.trim());
  }
  for (const m of expression.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) {
    bound.add(m[1]);
  }
  return bound;
}

function offendersOf(file, html) {
  const aliases = aliasesIn(html);
  const stack = []; // { tag, scope }
  const offenders = [];

  for (const m of html.matchAll(TAG)) {
    const tag = m[2].toLowerCase();
    if (m[1] === "/") {
      while (stack.length && stack[stack.length - 1].tag !== tag) stack.pop();
      stack.pop();
      continue;
    }

    const attrs = attrsOf(m[3]);
    const scope = new Set();
    for (const [name, value] of attrs) {
      if (name !== "x-for") continue;
      const parsed = value.match(ALIAS);
      if (parsed) for (const part of parsed[1].split(",")) scope.add(part.trim());
    }

    const active = new Set(scope);
    for (const entry of stack) for (const id of entry.scope) active.add(id);

    const line = html.slice(0, m.index).split("\n").length;
    for (const [name, value] of attrs) {
      if (!EVALUATED.test(name)) continue;
      const bound = arrowBindingsIn(value);
      for (const alias of aliases) {
        if (active.has(alias) || bound.has(alias)) continue;
        if (new RegExp(`(?<![\\w$.])${alias}\\s*\\.`).test(value)) {
          offenders.push(`${file}:${line} ${name}="${value.trim()}" -> ${alias}`);
        }
      }
    }

    if (!/\/\s*$/.test(m[3]) && !VOID.has(tag)) stack.push({ tag, scope });
  }

  return offenders;
}

test("every x-for alias is only read inside the loop that declares it", () => {
  const offenders = FILES.flatMap((file) => offendersOf(file, read(file)));
  assert.deepEqual(offenders, [], `x-for aliases read out of scope:\n${offenders.join("\n")}`);
});

test("the guard catches a chip read from a sibling loop", () => {
  const html = [
    '<span x-for="chip in chips" x-text="chip.name"></span>',
    '<div x-for="row in rows"><button :class="{ chosen: chip.id === row.id }"></button></div>',
  ].join("\n");
  assert.deepEqual(offendersOf("fixture.html", html), [
    'fixture.html:2 :class="{ chosen: chip.id === row.id }" -> chip',
  ]);
});

test("the guard reads the import map partial", () => {
  assert.ok(FILES.includes("frontend/src/partials/import-map.html"));
});
