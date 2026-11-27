import test from "node:test";
import assert from "node:assert/strict";

import { steps } from "../../frontend/src/views/steps.js";
import { artifact, read } from "./util.js";

const MAP = JSON.parse(read("data/fieldset-map.json"));
const ARTIFACT = artifact();
const PROSE = ["discussion", "hop_strategy", "fermentation_strategy", "process_notes"];
const WIDTHS = new Set(["full", "narrow", "regular", "wide"]);
const HOMES = new Set(["panel", "drawer", "retired"]);

function resolve(path) {
  if (ARTIFACT.nodes[path]) return { kind: ARTIFACT.nodes[path].kind, type: "node" };
  const parts = path.split(".");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    const node = ARTIFACT.nodes[id];
    if (!node) continue;
    const suffix = parts.slice(index).join(".");
    if (node.kind === "boundary") {
      return Object.hasOwn(node.outputs ?? {}, suffix) ? { kind: "output", type: "path" } : null;
    }
    if (node.kind === "selection") {
      const schema = ARTIFACT.primitive_schemas[node.output?.schema] ?? {};
      return Object.hasOwn(schema, suffix) ? { kind: "path", type: "path" } : null;
    }
    if (node.kind === "collection") {
      const schema = ARTIFACT.primitive_schemas[node.item_schema] ?? {};
      return Object.hasOwn(schema, suffix) || Object.hasOwn(node.fields ?? {}, suffix)
        ? { kind: "path", type: "path" }
        : null;
    }
    return null;
  }
  for (const namespace of Object.keys(ARTIFACT.identity ?? {})) {
    if (path === namespace || path.startsWith(`${namespace}.`)) {
      return { kind: "identity", type: "identity" };
    }
  }
  return null;
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => strings(item, out));
  return out;
}

function stepPaths() {
  const paths = new Set();
  for (const step of steps) {
    for (const value of strings(step)) {
      if (!/^[a-z_]+\.[a-z0-9_.]+$/.test(value)) continue;
      if (resolve(value)) paths.add(value);
    }
  }
  return [...paths];
}

function authorable() {
  return Object.entries(ARTIFACT.nodes)
    .filter(([, node]) => ["root", "choice", "collection", "selection"].includes(node.kind))
    .map(([id]) => id);
}

function required() {
  return [...new Set([...authorable(), ...stepPaths(), ...PROSE])].sort();
}

function failures(map, source) {
  const found = [];
  const expected = required();
  const declared = Object.keys(map.homes ?? {}).sort();

  for (const path of expected) {
    if (!declared.includes(path)) found.push(`missing home for "${path}"`);
  }
  for (const path of declared) {
    if (!expected.includes(path)) found.push(`"${path}" is not a step field or authorable action`);
    if (!resolve(path) && !PROSE.includes(path)) found.push(`"${path}" does not resolve`);
  }

  const fieldsetIds = new Set(Object.keys(map.fieldsets ?? {}));
  for (const [id, meta] of Object.entries(map.fieldsets ?? {})) {
    if (typeof meta.title !== "string" || meta.title.trim() === "") {
      found.push(`fieldset "${id}" has no title`);
    }
    if (!WIDTHS.has(meta.width)) found.push(`fieldset "${id}" has width "${meta.width}"`);
  }

  const used = new Set();
  for (const [path, home] of Object.entries(map.homes ?? {})) {
    if (fieldsetIds.has(home)) {
      used.add(home);
      const node = source.nodes[path];
      if (node && !["root", "choice", "collection", "selection"].includes(node.kind)) {
        found.push(`readout "${path}" is assigned to authored fieldset "${home}"`);
      }
      continue;
    }
    if (!HOMES.has(home)) found.push(`"${path}" has unknown home "${home}"`);
    if (home === "panel") {
      const node = source.nodes[path];
      if (node && ["root", "choice", "collection", "selection"].includes(node.kind)) {
        found.push(`authorable "${path}" is assigned to the read-only panel`);
      }
    }
  }
  for (const id of fieldsetIds) {
    if (!used.has(id)) found.push(`fieldset "${id}" owns no fields`);
  }

  const reasons = map.retired_reasons ?? {};
  for (const [path, home] of Object.entries(map.homes ?? {})) {
    if (home === "retired" && !String(reasons[path] ?? "").trim()) {
      found.push(`retired "${path}" has no reason`);
    }
    if (home !== "retired" && reasons[path]) found.push(`"${path}" has a stale retired reason`);
  }

  return found;
}

test("every step field and authorable action has exactly one home", () => {
  assert.deepEqual(failures(MAP, ARTIFACT), []);
});

test("each fieldset declares a width and owns fields", () => {
  assert.deepEqual(Object.keys(MAP.fieldsets).sort(), [
    "boil",
    "grist",
    "hops",
    "mash",
    "targets",
    "water",
    "yeast",
  ]);
});

test("an unassigned root fails", () => {
  const mutated = structuredClone(MAP);
  delete mutated.homes["batch.target_abv"];

  assert.ok(
    failures(mutated, ARTIFACT).includes('missing home for "batch.target_abv"')
  );
});

test("an authorable root cannot hide in the panel", () => {
  const mutated = structuredClone(MAP);
  mutated.homes["batch.target_abv"] = "panel";

  assert.ok(
    failures(mutated, ARTIFACT).includes(
      'authorable "batch.target_abv" is assigned to the read-only panel'
    )
  );
});

test("an unknown home fails", () => {
  const mutated = structuredClone(MAP);
  mutated.homes["batch.target_abv"] = "elsewhere";

  assert.ok(failures(mutated, ARTIFACT).includes('"batch.target_abv" has unknown home "elsewhere"'));
});

test("a retired home needs a reason", () => {
  const mutated = structuredClone(MAP);
  mutated.homes["batch.target_abv"] = "retired";
  delete mutated.retired_reasons["batch.conversion_efficiency"];

  const result = failures(mutated, ARTIFACT);
  assert.ok(result.includes('retired "batch.target_abv" has no reason'));
  assert.ok(result.includes('retired "batch.conversion_efficiency" has no reason'));
});
