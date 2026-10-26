// Alpine only tracks dependencies it can see. A getter that reads the engine
// registers nothing, so a template binding to it freezes at its first render.
// Every readout that a partial binds must therefore be a mirrored value that a
// refresh function assigns, not a live engine read.

import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";

const ATTR = /\b(?:x-text|x-html|x-if|x-show|x-for|x-model|x-effect|:[\w-]+|x-bind:[\w-]+)\s*=\s*"([^"]*)"/g;
const IDENT = /[A-Za-z_$][\w$]*/g;

const ALLOW = {
  lateSugarField: "reads this.fieldsBySlice, which every refresh reassigns",
  sugarDraftMassDisplay: "reads this.draftRows, which the editor reassigns",
  sugarDraftExtractDisplay: "reads this.draftRows, which the editor reassigns",
};

function descriptorBlocks(src) {
  const out = [];
  for (const match of src.matchAll(/Object\.defineProperties\(app,\s*\{/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < src.length; end += 1) {
      if (src[end] === "{") depth += 1;
      else if (src[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({
      line: src.slice(0, match.index).split("\n").length,
      body: src.slice(start + 1, end),
    });
  }
  return out;
}

function topLevelEntries(body) {
  const entries = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "{" || char === "[" || char === "(") depth += 1;
    else if (char === "}" || char === "]" || char === ")") depth -= 1;
    if (depth === 0 && char === ",") {
      entries.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  entries.push(current);
  return entries.map((entry) => entry.trim()).filter(Boolean);
}

function engineGetters() {
  const found = [];
  for (const abs of walk("frontend/src/adapters", [".js"])) {
    const src = read(rel(abs));
    for (const block of descriptorBlocks(src)) {
      for (const entry of topLevelEntries(block.body)) {
        const name = entry.match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1];
        if (!name) continue;
        if (!/ctx\.engine|\bengine\./.test(entry)) continue;
        found.push({ name, file: rel(abs), line: block.line });
      }
    }
  }
  return found;
}

function boundNames() {
  const names = new Set();
  const files = [
    ...walk("frontend/src/partials", [".html"]),
    ...walk("frontend/src/views", [".html"]),
  ];
  if (files.length === 0) throw new Error("no templates found to inspect");
  for (const abs of files) {
    const src = read(rel(abs));
    for (const match of src.matchAll(ATTR)) {
      for (const ident of match[1].match(IDENT) ?? []) names.add(ident);
    }
  }
  return names;
}

test("template-bound getters never read the engine directly", () => {
  const bound = boundNames();
  const offenders = engineGetters()
    .filter((getter) => bound.has(getter.name) && !(getter.name in ALLOW))
    .map((getter) => `${getter.file}:${getter.line}: ${getter.name}`);
  assert.deepEqual(
    offenders,
    [],
    `Bind these through a refresh-time mirror instead:\n${offenders.join("\n")}`
  );
});

test("every allowlist entry still exists, still reads the engine, and is bound", () => {
  const bound = boundNames();
  const byName = new Map(engineGetters().map((getter) => [getter.name, getter]));
  for (const [name, reason] of Object.entries(ALLOW)) {
    assert.ok(byName.has(name), `${name} no longer reads the engine; drop its ${reason}`);
    assert.ok(bound.has(name), `${name} is no longer bound; drop its allowlist entry`);
  }
});
