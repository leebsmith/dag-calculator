import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph } from "../../frontend/src/engine/dag.js";
import { compileExpression } from "../../frontend/src/engine/expression.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact, read } from "./util.js";

const ARTIFACT = artifact();
const GRAPH = buildGraph(ARTIFACT);
const STAGE_ORDER = JSON.parse(read("data/stage-order.json"));
const NAMESPACES = Object.keys(ARTIFACT.identity ?? {});
const BOUNDARIES = Object.keys(ARTIFACT.nodes)
  .filter((id) => ARTIFACT.nodes[id].kind === "boundary")
  .sort();

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => strings(item, out));
  }
  return out;
}

function nodeOf(path) {
  if (ARTIFACT.nodes[path]) return path;
  const parts = path.split(".");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    if (ARTIFACT.nodes[id]) return id;
  }
  return null;
}

function isIdentity(path) {
  return NAMESPACES.some((namespace) => path === namespace || path.startsWith(`${namespace}.`));
}

function stepIndex() {
  const index = new Map();
  steps.forEach((step, position) => {
    for (const value of strings(step)) {
      const id = nodeOf(value);
      if (id && !index.has(id)) index.set(id, position);
      if (!id && isIdentity(value) && !index.has(value)) index.set(value, position);
    }
  });
  return index;
}

const INDEX = stepIndex();

function closure(id, edges) {
  const seen = new Set();
  const queue = [...(edges[id] ?? [])];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges[current] ?? []) if (!seen.has(next)) queue.push(next);
  }
  return seen;
}

function identityRefs(node) {
  const refs = [];
  if (node.kind === "derived" || node.kind === "boundary") {
    refs.push(...Object.values(node.inputs ?? {}));
  }
  if (node.kind === "collection") {
    for (const spec of Object.values(node.fields ?? {})) refs.push(...Object.values(spec.inputs ?? {}));
  }
  if (node.kind === "selection" && node.ref) refs.push(node.ref);
  if (typeof node.default === "string") refs.push(...compileExpression(node.default).paths);
  return refs.filter(isIdentity);
}

function boundaryInputIndex(boundary) {
  const upstream = closure(boundary, GRAPH.adjacency);
  const authored = [...upstream].filter(
    (id) => ["root", "choice", "collection"].includes(ARTIFACT.nodes[id].kind) && INDEX.has(id)
  );
  const identity = [...upstream].flatMap((id) => identityRefs(ARTIFACT.nodes[id]));
  const positions = [
    ...authored.map((id) => INDEX.get(id)),
    ...identity.filter((path) => INDEX.has(path)).map((path) => INDEX.get(path)),
  ];
  return positions.length > 0 ? Math.max(...positions) : -1;
}

function violations() {
  const required = Object.fromEntries(BOUNDARIES.map((id) => [id, boundaryInputIndex(id)]));
  const found = new Map();
  for (const id of Object.keys(ARTIFACT.nodes)) {
    if (!INDEX.has(id)) continue;
    const upstream = closure(id, GRAPH.adjacency);
    const crossed = BOUNDARIES.filter((boundary) => upstream.has(boundary));
    if (crossed.length === 0) continue;
    const need = Math.max(...crossed.map((boundary) => required[boundary]));
    const position = INDEX.get(id);
    if (position >= need) continue;
    found.set(`${id}@${steps[position].id}`, {
      node: id,
      step: steps[position].id,
      position,
      need,
      boundaries: crossed,
    });
  }
  return found;
}

test("no solved value appears before its prerequisites, except accepted previews", () => {
  const accepted = STAGE_ORDER.accepted ?? {};
  const offenders = [...violations().keys()].filter((key) => !accepted[key]);
  assert.deepEqual(offenders, [], `out-of-order readouts:\n${offenders.join("\n")}`);
});

test("every accepted preview is live and explained", () => {
  const found = violations();
  const failures = [];
  for (const [key, reason] of Object.entries(STAGE_ORDER.accepted ?? {})) {
    if (!reason) failures.push(`${key} has no reason`);
    if (!found.has(key)) failures.push(`${key} is not an out-of-order readout`);
  }
  assert.deepEqual(failures, []);
});

test("the boundary spine is batch, then the parallel hops and water solves", () => {
  const layers = Object.fromEntries(
    BOUNDARIES.map((id) => [
      id,
      BOUNDARIES.filter((other) => closure(id, GRAPH.adjacency).has(other)),
    ])
  );

  assert.deepEqual(layers["solver.batch"], []);
  assert.deepEqual(layers["solver.hops"], ["solver.batch"]);
  assert.deepEqual(layers["solver.water"], ["solver.batch"]);
});

test("the derivation sees the authored inputs that gate each solve", () => {
  const batchStep = steps.findIndex((step) => step.id === "batch");
  const waterStep = steps.findIndex((step) => step.id === "water");

  assert.equal(boundaryInputIndex("solver.batch"), batchStep);
  assert.equal(boundaryInputIndex("solver.water"), waterStep);
});
