// Alpine only tracks dependencies it can see. A getter that reads the engine
// registers nothing, so a template binding to it freezes at its first render.
// Every readout that a partial binds must therefore be a mirrored value that a
// refresh function assigns, not a live engine read.

import test from "node:test";
import assert from "node:assert/strict";
import { walk, read, rel } from "./util.js";

const ATTR = /\b(?:x-text|x-html|x-if|x-show|x-for|x-model|x-effect|x-data|:[\w-]+|x-bind:[\w-]+)\s*=\s*"([^"]*)"/g;
const IDENT = /[A-Za-z_$][\w$]*/g;

const ALLOW = {
  brewDayLevel: "reads the engine root for the checklist level picker's value binding",
  coolingCurveId: "reads the engine root for the picker's value binding",
  lateSugarField: "reads view.fieldsBySlice, which every refresh reassigns",
  sugarDraftMassDisplay: "reads view.draftRows, which the editor reassigns",
};

// A descriptor getter, wherever it lives: inline in an `Object.defineProperties`
// literal or returned by a card's descriptor factory. Anchoring on the getter body
// keeps both shapes in view, so splitting a card into helper modules cannot hide a
// bound readout from the guard.
function descriptorGetters(src) {
  const out = [];
  for (const match of src.matchAll(/configurable:\s*true,\s*\n\s*get\(\)\s*\{/g)) {
    const open = src.lastIndexOf("{", match.index);
    if (open < 0) continue;
    const name = src.slice(0, open).match(/([A-Za-z_$][\w$]*)\s*:\s*$/)?.[1];
    if (!name) continue;
    let depth = 0;
    let end = open;
    for (; end < src.length; end += 1) {
      if (src[end] === "{") depth += 1;
      else if (src[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({
      name,
      line: src.slice(0, open).split("\n").length,
      body: src.slice(open + 1, end),
    });
  }
  return out;
}

function engineGetters() {
  const found = [];
  for (const abs of walk("frontend/src/adapters", [".js"])) {
    const src = read(rel(abs));
    for (const getter of descriptorGetters(src)) {
      if (!/ctx\.engine|\bengine\./.test(getter.body)) continue;
      found.push({ name: getter.name, file: rel(abs), line: getter.line });
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
