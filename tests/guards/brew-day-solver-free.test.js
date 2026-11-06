// Brew day is a read-and-record path: it reads the frozen report bundle and
// writes session state through the API. It must never solve, because that would
// reintroduce a boundary (and a second implementation of one) into the one
// screen that has to work from a bundle alone. Freezing is where solving stops.

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";

import { ROOT, read, rel } from "./util.js";

const BREW_DAY_MODULES = [
  "frontend/src/store/brewSession.js",
  "frontend/src/store/brewSessionActions.js",
  "frontend/src/store/brewSessionGetters.js",
  "frontend/src/store/brewSessionModel.js",
  "frontend/src/store/observationCorrections.js",
  "frontend/src/views/brewDayLogic.js",
  "frontend/src/views/checklist/catalog.js",
  "frontend/src/views/producer/checklist/providers.js",
  "frontend/src/views/producer/checklist/table.js",
];

const SOLVER_MODULES = new Set([
  "frontend/src/engine/index.js",
  "frontend/src/engine/dag.js",
  "frontend/src/adapters/session.js",
  "frontend/src/adapters/boundaryRunner.js",
  "frontend/src/adapters/boundaryRequest.js",
]);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/.*$/gm, (match, lead) => lead + " ".repeat(match.length - lead.length));
}

function importSpecifiers(source) {
  const text = stripComments(source);
  const found = [];
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    found.push({ specifier: match[1], line: text.slice(0, match.index).split("\n").length });
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ specifier: match[1], line: text.slice(0, match.index).split("\n").length });
  }
  return found;
}

test("the brew-day path imports no engine and no boundary runner", () => {
  const offenders = [];
  for (const module of BREW_DAY_MODULES) {
    const abs = resolve(ROOT, module);
    for (const { specifier, line } of importSpecifiers(read(module))) {
      if (!specifier.startsWith(".")) continue;
      const target = rel(resolve(dirname(abs), specifier));
      if (SOLVER_MODULES.has(target)) {
        offenders.push(`${module}:${line}: imports ${target}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Brew day resolves from the frozen bundle; move the solve to authoring time."
  );
});

test("the brew-day path reads no solver output", () => {
  const offenders = [];
  for (const module of BREW_DAY_MODULES) {
    const lines = stripComments(read(module)).split("\n");
    lines.forEach((text, index) => {
      if (/"solver\.[a-z_]/i.test(text) || /'solver\.[a-z_]/i.test(text)) {
        offenders.push(`${module}:${index + 1}: ${text.trim()}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "The session reads `bundle.*`; a `solver.*` path means it is re-reading a solve."
  );
});
