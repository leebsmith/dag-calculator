import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RELATION_FINDINGS } from "../../frontend/src/views/registry/findings.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact, read, rel, walk } from "./util.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const DERIVER = join(ROOT, "scripts", "derive-report-states.mjs");
const ARTIFACT = artifact();
const SURFACE = JSON.parse(read("data/surface.json"));
const PARITY = JSON.parse(read("data/report-parity.json"));

const STATES = [
  { name: "normal", bundle: JSON.parse(read("tests/conformance/fixtures/report-bundle.json")) },
  {
    name: "draft",
    bundle: JSON.parse(read("tests/conformance/fixtures/report-states/draft-before-solve.json")),
  },
  {
    name: "water-unavailable",
    bundle: JSON.parse(read("tests/conformance/fixtures/report-states/water-unavailable.json")),
  },
];

function resolve(path) {
  if (ARTIFACT.nodes[path]) return true;
  const parts = path.split(".");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    const node = ARTIFACT.nodes[id];
    if (!node) continue;
    const suffix = parts.slice(index).join(".");
    if (node.kind === "boundary") return Object.hasOwn(node.outputs ?? {}, suffix);
    if (node.kind === "selection") {
      return Object.hasOwn(ARTIFACT.primitive_schemas[node.output?.schema] ?? {}, suffix);
    }
    return false;
  }
  const namespaces = Object.keys(ARTIFACT.identity ?? {});
  return namespaces.some((namespace) => path === namespace || path.startsWith(`${namespace}.`));
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => strings(item, out));
  return out;
}

function registryPaths() {
  const found = new Set();
  for (const file of walk("frontend/src/views/registry", [".js"]).map(rel)) {
    if (file.endsWith("surface.generated.js")) continue;
    const source = read(file);
    for (const match of source.matchAll(/"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/g)) {
      if (resolve(match[1])) found.add(match[1]);
    }
  }
  return found;
}

function reachable() {
  const found = new Set();
  for (const step of steps) {
    for (const value of strings(step)) {
      if (!/^[a-z_]+\.[a-z0-9_.]+$/.test(value)) continue;
      if (resolve(value)) found.add(value);
    }
  }
  for (const path of registryPaths()) found.add(path);
  for (const family of SURFACE.families) {
    if (family.members === "schema") {
      const schemaId =
        ARTIFACT.identity?.[family.base] ?? ARTIFACT.nodes[family.base]?.output?.schema;
      for (const field of Object.keys(ARTIFACT.primitive_schemas[schemaId] ?? {})) {
        found.add(`${family.base}.${field}`);
      }
      continue;
    }
    for (const leaf of family.members) found.add(`${family.base}.${leaf}`);
  }
  for (const entry of SURFACE.internal) found.delete(entry.path);
  return found;
}

function domainDisposition(entry) {
  const node = ARTIFACT.nodes[entry.nodeId];
  if (!node) return `validation names unknown node "${entry.nodeId}"`;
  if (!entry.field) return null;
  const schemaId = node.kind === "selection" ? node.output?.schema : node.item_schema;
  const schema = ARTIFACT.primitive_schemas[schemaId] ?? {};
  if (schema[entry.field] || node.fields?.[entry.field]) return null;
  return `validation names unknown field "${entry.nodeId}.${entry.field}"`;
}

function printedPaths() {
  return new Set(STATES.flatMap(({ bundle }) => Object.keys(bundle.formatted ?? {})));
}

function derivedStates() {
  const directory = mkdtempSync(join(tmpdir(), "report-states-"));
  try {
    execFileSync(process.execPath, [DERIVER, "--out", directory], { cwd: ROOT, stdio: "pipe" });
    return Object.fromEntries(
      ["draft-before-solve", "water-unavailable"].map((name) => [
        name,
        readFileSync(join(directory, `${name}.json`), "utf8"),
      ])
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("every committed state fixture is in sync with its deriver", () => {
  const states = derivedStates();
  for (const [name, text] of Object.entries(states)) {
    assert.equal(
      read(`tests/conformance/fixtures/report-states/${name}.json`),
      text,
      `report-states/${name}.json is stale — run scripts/derive-report-states.mjs`
    );
  }
});

test("every printed value is reachable or allowlisted with a reason", () => {
  const reached = reachable();
  const allowlisted = PARITY.gaps ?? {};
  const offenders = [];
  for (const { name, bundle } of STATES) {
    for (const path of Object.keys(bundle.formatted ?? {})) {
      if (reached.has(path) || allowlisted[path]) continue;
      offenders.push(`${name}: ${path}`);
    }
  }
  assert.deepEqual(offenders, [], `printed values with no surface:\n${offenders.join("\n")}`);
});

test("the allowlist has no stale or unexplained entries", () => {
  const reached = reachable();
  const printed = printedPaths();
  const failures = [];
  for (const [path, reason] of Object.entries(PARITY.gaps ?? {})) {
    if (reason.trim() === "") failures.push(`${path} has no reason`);
    if (!printed.has(path)) failures.push(`${path} is not printed by any state`);
    if (reached.has(path)) failures.push(`${path} is reachable; drop the entry`);
  }
  assert.deepEqual(failures, []);
});

test("every printed table names a collection or a declared report table", () => {
  const tables = PARITY.report_tables ?? {};
  const offenders = [];
  for (const { name, bundle } of STATES) {
    for (const id of Object.keys(bundle.formatted_tables ?? {})) {
      if (tables[id]) continue;
      if (ARTIFACT.nodes[id]?.kind !== "collection") offenders.push(`${name}: ${id}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the report-table allowlist is live and explained", () => {
  const printed = new Set(
    STATES.flatMap(({ bundle }) => Object.keys(bundle.formatted_tables ?? {}))
  );
  const failures = [];
  for (const [id, reason] of Object.entries(PARITY.report_tables ?? {})) {
    if (reason.trim() === "") failures.push(`${id} has no reason`);
    if (!printed.has(id)) failures.push(`${id} is not printed by any state`);
  }
  assert.deepEqual(failures, []);
});

test("every printed summary names a collection or the overall aggregate", () => {
  const offenders = [];
  for (const { name, bundle } of STATES) {
    for (const id of Object.keys(bundle.formatted_summaries ?? {})) {
      if (id === "overall" || ARTIFACT.nodes[id]?.kind === "collection") continue;
      offenders.push(`${name}: ${id}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every relation and domain violation has a disposition", () => {
  const failures = [];
  for (const { name, bundle } of STATES) {
    for (const relation of bundle.validation?.relations ?? []) {
      if (!RELATION_FINDINGS[relation.id]) failures.push(`${name}: relation ${relation.id}`);
    }
    for (const entry of [
      ...(bundle.validation?.domains ?? []),
      ...(bundle.validation?.field_domains ?? []),
      ...(bundle.validation?.collection_domains ?? []),
    ]) {
      const failure = domainDisposition(entry);
      if (failure) failures.push(`${name}: ${failure}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("every artifact relation is dispositioned even when the bundle is quiet", () => {
  const missing = ARTIFACT.relations.map((relation) => relation.id).filter(
    (id) => !RELATION_FINDINGS[id]
  );
  assert.deepEqual(missing, []);
});
