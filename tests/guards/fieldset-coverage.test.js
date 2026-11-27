import test from "node:test";
import assert from "node:assert/strict";

import { steps } from "../../frontend/src/views/steps.js";
import { drawer, fieldsets, homes, panel, retired } from "../../frontend/src/views/fieldsets.js";
import { artifact, rel, walk } from "./util.js";

const ARTIFACT = artifact();
const PROSE = ["discussion", "hop_strategy", "fermentation_strategy", "process_notes"];
const WIDTHS = new Set(["full", "narrow", "regular", "wide"]);
const AUTHORABLE = new Set(["root", "choice", "collection", "selection"]);

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
    .filter(([, node]) => AUTHORABLE.has(node.kind))
    .map(([id]) => id);
}

function required() {
  return [...new Set([...authorable(), ...stepPaths(), ...PROSE])].sort();
}

function isAuthorable(path) {
  return AUTHORABLE.has(ARTIFACT.nodes[path]?.kind);
}

function failures(manifest = fieldsets, map = homes, reasons = retired) {
  const found = [];
  const expected = required();
  const declared = Object.keys(map).sort();

  for (const path of expected) {
    if (!declared.includes(path)) found.push(`missing home for "${path}"`);
  }
  for (const path of declared) {
    if (!expected.includes(path)) found.push(`"${path}" is not a step field or authorable action`);
    if (!resolve(path) && !PROSE.includes(path)) found.push(`"${path}" does not resolve`);
  }

  const partials = walk("frontend/src/partials", [".html"]).map((file) => `frontend/${rel(file).split("frontend/")[1]}`.replace("frontend/src", "src"));
  const seen = new Set();
  for (const fieldset of manifest) {
    for (const key of ["title", "subtitle"]) {
      if (typeof fieldset[key] !== "string" || fieldset[key].trim() === "") {
        found.push(`fieldset "${fieldset.id}" has no ${key}`);
      }
    }
    if (!WIDTHS.has(fieldset.width)) found.push(`fieldset "${fieldset.id}" has width "${fieldset.width}"`);
    if (!partials.some((path) => path.endsWith(fieldset.partial.replace("./src/", "")))) {
      found.push(`fieldset "${fieldset.id}" names a missing partial "${fieldset.partial}"`);
    }
    const ids = fieldset.blocks.flatMap((block) => block.fields);
    if (ids.length === 0) found.push(`fieldset "${fieldset.id}" owns no fields`);
    for (const block of fieldset.blocks) {
      if (!block.id || block.fields.length === 0) found.push(`fieldset "${fieldset.id}" has an empty block`);
      for (const id of block.fields) {
        if (seen.has(id)) found.push(`"${id}" is declared twice`);
        seen.add(id);
        if (!isAuthorable(id)) found.push(`readout "${id}" is declared in a fieldset`);
        if (map[id] !== fieldset.id) found.push(`"${id}" is not homed to "${fieldset.id}"`);
      }
    }
  }

  for (const [id, home] of Object.entries(map)) {
    if (home === "panel" && isAuthorable(id)) {
      found.push(`authorable "${id}" is assigned to the read-only panel`);
    }
    if (home === "retired" && !String(reasons[id] ?? "").trim()) {
      found.push(`retired "${id}" has no reason`);
    }
  }
  for (const id of panel) {
    if (map[id] !== "panel") found.push(`"${id}" is not homed to the panel`);
  }
  for (const id of drawer) {
    if (map[id] !== "drawer") found.push(`"${id}" is not homed to the drawer`);
  }
  for (const id of Object.keys(reasons)) {
    if (map[id] !== "retired") found.push(`"${id}" is not homed to retired`);
  }

  return found;
}

test("every step field and authorable action has exactly one home", () => {
  assert.deepEqual(failures(), []);
});

test("the wall has the seven declared fieldsets", () => {
  assert.deepEqual(
    fieldsets.map((fieldset) => fieldset.id),
    ["targets", "yeast", "grist", "hops", "mash", "water", "boil"]
  );
});

test("an unassigned root fails", () => {
  const map = { ...homes };
  delete map["batch.target_abv"];
  assert.ok(failures(fieldsets, map).includes('missing home for "batch.target_abv"'));
});

test("an authorable root cannot hide in the panel", () => {
  const map = { ...homes, "batch.target_abv": "panel" };
  assert.ok(
    failures(fieldsets, map).includes('authorable "batch.target_abv" is assigned to the read-only panel')
  );
});

test("a readout cannot enter a fieldset", () => {
  const manifest = structuredClone(fieldsets);
  manifest[0].blocks[0].fields.push("solver.batch.sg_post_boil");
  assert.ok(failures(manifest).some((message) => message.startsWith('readout "solver.batch.sg_post_boil"')));
});

test("a retired home needs a reason", () => {
  const map = { ...homes, "batch.target_abv": "retired" };
  assert.ok(failures(fieldsets, map).includes('retired "batch.target_abv" has no reason'));
});
