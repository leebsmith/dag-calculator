import test from "node:test";
import assert from "node:assert/strict";

import { artifact, read } from "./util.js";

const SURFACE = JSON.parse(read("data/surface.json"));
const ARTIFACT = artifact();

function membersUnder(source, base) {
  const prefix = `${base}.`;
  const paths = new Set();
  for (const [id, node] of Object.entries(source.nodes)) {
    if (id.startsWith(prefix)) paths.add(id);
    if (node.kind !== "boundary") continue;
    for (const key of Object.keys(node.outputs ?? {})) {
      const full = `${id}.${key}`;
      if (full.startsWith(prefix)) paths.add(full);
    }
  }
  return [...paths].map((path) => path.slice(prefix.length)).sort();
}

function schemaId(source, base) {
  if (source.identity?.[base]) return source.identity[base];
  const node = source.nodes[base];
  if (node?.kind === "selection") return node.output?.schema ?? null;
  return null;
}

function resolves(source, path) {
  if (source.nodes[path]) return true;
  const parts = path.split(".");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    const node = source.nodes[id];
    if (!node) continue;
    if (node.kind !== "boundary") return false;
    return Object.hasOwn(node.outputs ?? {}, parts.slice(index).join("."));
  }
  return false;
}

function failures(surface, source) {
  const found = [];
  const roots = Object.entries(source.nodes)
    .filter(([, node]) => node.kind === "root" || node.kind === "choice")
    .map(([id]) => id)
    .sort();
  const groups = surface.roots ?? {};
  const declared = [...Object.keys(groups.inherited ?? {}), ...Object.keys(groups.authored ?? {})];

  for (const id of roots) {
    if (!declared.includes(id)) found.push(`undeclared root "${id}"`);
  }
  for (const id of declared) {
    const node = source.nodes[id];
    if (!node) found.push(`declared "${id}" is not a node`);
    else if (node.kind !== "root" && node.kind !== "choice") {
      found.push(`declared "${id}" is a ${node.kind}, not a root or choice`);
    }
  }
  for (const id of new Set(declared.filter((entry, index) => declared.indexOf(entry) !== index))) {
    found.push(`"${id}" is declared twice`);
  }
  for (const [kind, entries] of Object.entries(groups)) {
    if (kind !== "inherited" && kind !== "authored") found.push(`unknown root class "${kind}"`);
    for (const [id, reason] of Object.entries(entries)) {
      if (typeof reason !== "string" || reason.trim() === "") {
        found.push(`"${id}" has no reason`);
      }
    }
  }

  const bases = [];
  for (const family of surface.families ?? []) {
    bases.push(family.base);
    if (!family.reason) found.push(`family "${family.base}" has no reason`);
    if (family.members === "schema") {
      if (!schemaId(source, family.base)) found.push(`family "${family.base}" has no schema`);
      continue;
    }
    if (!Array.isArray(family.members) || family.members.length === 0) {
      found.push(`family "${family.base}" has no members`);
      continue;
    }
    for (const leaf of family.members) {
      if (!resolves(source, `${family.base}.${leaf}`)) {
        found.push(`family "${family.base}" member "${leaf}" does not resolve`);
      }
    }
    const actual = membersUnder(source, family.base);
    for (const leaf of actual) {
      if (!family.members.includes(leaf)) {
        found.push(`family "${family.base}" is missing "${leaf}"`);
      }
    }
    for (const leaf of family.members) {
      if (!actual.includes(leaf)) {
        found.push(`family "${family.base}" lists "${leaf}", which the artifact does not have`);
      }
    }
  }
  for (const base of new Set(bases.filter((entry, index) => bases.indexOf(entry) !== index))) {
    found.push(`family "${base}" is declared twice`);
  }

  const internal = new Set();
  const cardLabelled = new Set(Object.keys(surface.card_labelled ?? {}));
  for (const entry of surface.internal ?? []) {
    if (!entry.reason) found.push(`internal "${entry.path}" has no reason`);
    if (!resolves(source, entry.path)) found.push(`internal "${entry.path}" does not resolve`);
    if (internal.has(entry.path)) found.push(`internal "${entry.path}" is declared twice`);
    if (cardLabelled.has(entry.path)) {
      found.push(`internal "${entry.path}" is also card-labelled`);
    }
    internal.add(entry.path);
  }

  return found;
}

test("every root and choice has an authoring class", () => {
  assert.deepEqual(failures(SURFACE, ARTIFACT), []);
});

test("a new root without a declaration fails", () => {
  const mutated = structuredClone(ARTIFACT);
  mutated.nodes["batch.surface_probe"] = {
    kind: "root",
    dimension: "percentage",
    default: "0.5",
  };

  assert.ok(
    failures(SURFACE, mutated).includes('undeclared root "batch.surface_probe"'),
    "the guard must reject an undeclared root"
  );
});

test("a new member of a declared family fails", () => {
  const mutated = structuredClone(ARTIFACT);
  mutated.nodes["water.target.surface_probe"] = {
    kind: "root",
    dimension: "concentration",
    default: "0",
  };

  const found = failures(SURFACE, mutated);
  assert.ok(found.includes('family "water.target" is missing "surface_probe"'));
  assert.ok(found.includes('undeclared root "water.target.surface_probe"'));
});

test("every family member and internal path resolves", () => {
  const found = failures(SURFACE, ARTIFACT);
  assert.deepEqual(
    found.filter((entry) => entry.includes("does not resolve")),
    []
  );
});
