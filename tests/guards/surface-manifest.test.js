import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { surfaceManifest } from "../../frontend/src/views/registry/surface.generated.js";
import { artifact, read } from "./util.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const GENERATOR = join(ROOT, "scripts", "emit-surface.mjs");
const ARTIFACT = artifact();
const SURFACE = JSON.parse(read("data/surface.json"));
const LABELS = JSON.parse(read("data/labels.json"));

function generated() {
  const directory = mkdtempSync(join(tmpdir(), "surface-manifest-"));
  const output = join(directory, "surface.generated.js");
  try {
    execFileSync(process.execPath, [GENERATOR, "--out", output], { cwd: ROOT, stdio: "pipe" });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function controlFor(node) {
  if (node.kind === "root" && node.dimension === "reference") return "selection-picker";
  if (node.kind === "root") return "number";
  if (node.kind === "choice") return "choice-select";
  return "readout";
}

function expectedNode(node) {
  const reference = node.kind === "root" && node.dimension === "reference";
  return {
    kind: reference ? "reference" : node.kind,
    isInput: node.kind === "root" || node.kind === "choice",
    control: controlFor(node),
    dimension: reference ? "reference" : (node.output?.dimension ?? node.dimension ?? null),
    taxonomy: node.output?.taxonomy ?? node.taxonomy ?? null,
  };
}

function entriesUnder() {
  const expected = new Map();
  for (const [id, node] of Object.entries(ARTIFACT.nodes)) {
    expected.set(id, expectedNode(node));
    if (node.kind === "boundary") {
      for (const [key, spec] of Object.entries(node.outputs ?? {})) {
        expected.set(`${id}.${key}`, {
          kind: "path",
          isInput: false,
          control: "readout",
          dimension: spec.dimension ?? null,
          taxonomy: spec.taxonomy ?? null,
        });
      }
    }
    if (node.kind === "selection") {
      for (const [field, spec] of Object.entries(
        ARTIFACT.primitive_schemas[node.output?.schema] ?? {}
      )) {
        expected.set(`${id}.${field}`, {
          kind: "path",
          isInput: false,
          control: "readout",
          dimension: spec.dimension ?? null,
          taxonomy: spec.taxonomy ?? null,
        });
      }
    }
  }
  for (const [namespace, schemaId] of Object.entries(ARTIFACT.identity ?? {})) {
    for (const [field, spec] of Object.entries(ARTIFACT.primitive_schemas[schemaId] ?? {})) {
      expected.set(`${namespace}.${field}`, {
        kind: "path",
        isInput: false,
        control: "readout",
        dimension: spec.dimension ?? null,
        taxonomy: spec.taxonomy ?? null,
      });
    }
  }
  return expected;
}

function projection(entry) {
  return {
    kind: entry.kind,
    isInput: entry.isInput,
    control: entry.control,
    dimension: entry.dimension ?? null,
    taxonomy: entry.taxonomy ?? null,
  };
}

test("the committed manifest is in sync with the emitter", () => {
  assert.equal(
    read("frontend/src/views/registry/surface.generated.js"),
    generated(),
    "surface.generated.js is stale — run `make generate`"
  );
});

test("every projected path matches the artifact's rules", () => {
  const expected = entriesUnder();
  const manifest = surfaceManifest.paths;

  assert.deepEqual(
    Object.keys(manifest).sort(),
    [...expected.keys()].sort(),
    "the manifest must cover every node, boundary output, identity field and selection field"
  );
  for (const [path, entry] of Object.entries(manifest)) {
    assert.deepEqual(projection(entry), expected.get(path), `descriptor drift at ${path}`);
  }
});

test("the manifest keeps the artifact's node attachment", () => {
  assert.equal(surfaceManifest.paths["batch.target_abv"].owner, "batch.target_abv");
  assert.equal(surfaceManifest.paths["solver.batch.m_grist"].owner, "solver.batch");
  assert.equal(surfaceManifest.paths["batch.yeast.name"].selectionRef, "batch.yeast_id");
  assert.equal(surfaceManifest.paths["equipment.name"].identityNamespace, "equipment");
  assert.equal(surfaceManifest.paths["equipment.name"].owner, undefined);
});

test("the descriptor is deterministic", () => {
  assert.deepEqual(Object.keys(surfaceManifest.paths), [...Object.keys(surfaceManifest.paths)].sort());
  assert.equal(surfaceManifest.schema_version, ARTIFACT.schema_version);
});

test("every node is labelled, card-labelled, internal or inside a declared family", () => {
  const bases = SURFACE.families.map((family) => family.base);
  const internal = new Set(SURFACE.internal.map((entry) => entry.path));
  const uncovered = Object.keys(ARTIFACT.nodes).filter((id) => {
    const inFamily = bases.some((base) => id.startsWith(`${base}.`));
    return !LABELS[id] && !SURFACE.card_labelled?.[id] && !inFamily && !internal.has(id);
  });

  assert.deepEqual(uncovered, []);
});
