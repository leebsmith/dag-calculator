import test from "node:test";
import assert from "node:assert/strict";

import { RELATION_FINDINGS } from "../../frontend/src/views/registry/findings.js";
import { steps } from "../../frontend/src/views/steps.js";
import { artifact, read, rel, walk } from "./util.js";

const ARTIFACT = artifact();
const SURFACE = JSON.parse(read("data/surface.json"));
const PARITY = JSON.parse(read("data/report-parity.json"));
const BUNDLE = JSON.parse(read("tests/conformance/fixtures/report-bundle.json"));

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

test("every printed value is reachable or allowlisted with a reason", () => {
  const reached = reachable();
  const allowlisted = PARITY.gaps ?? {};
  const offenders = Object.keys(BUNDLE.formatted ?? {}).filter(
    (path) => !reached.has(path) && !allowlisted[path]
  );
  assert.deepEqual(offenders, [], `printed values with no surface:\n${offenders.join("\n")}`);
});

test("the allowlist has no stale or unexplained entries", () => {
  const reached = reachable();
  const allowlisted = PARITY.gaps ?? {};
  const formatted = new Set(Object.keys(BUNDLE.formatted ?? {}));
  const failures = [];
  for (const [path, reason] of Object.entries(allowlisted)) {
    if (reason.trim() === "") failures.push(`${path} has no reason`);
    if (!formatted.has(path)) failures.push(`${path} is not printed by the bundle`);
    if (reached.has(path)) failures.push(`${path} is reachable; drop the entry`);
  }
  assert.deepEqual(failures, []);
});

const TABLES = PARITY.report_tables ?? {};

test("every printed table names a collection or a declared report table", () => {
  const offenders = Object.keys(BUNDLE.formatted_tables ?? {}).filter((id) => {
    if (TABLES[id]) return false;
    return ARTIFACT.nodes[id]?.kind !== "collection";
  });
  assert.deepEqual(offenders, []);
});

test("the report-table allowlist is live and explained", () => {
  const printed = new Set(Object.keys(BUNDLE.formatted_tables ?? {}));
  const failures = [];
  for (const [id, reason] of Object.entries(TABLES)) {
    if (reason.trim() === "") failures.push(`${id} has no reason`);
    if (!printed.has(id)) failures.push(`${id} is not printed by the bundle`);
  }
  assert.deepEqual(failures, []);
});

test("every printed summary names a collection or the overall aggregate", () => {
  const offenders = Object.keys(BUNDLE.formatted_summaries ?? {}).filter(
    (id) => id !== "overall" && ARTIFACT.nodes[id]?.kind !== "collection"
  );
  assert.deepEqual(offenders, []);
});

test("every relation and domain violation has a disposition", () => {
  const failures = [];
  for (const relation of BUNDLE.validation?.relations ?? []) {
    if (!RELATION_FINDINGS[relation.id]) failures.push(`relation ${relation.id} has no finding`);
  }
  for (const entry of [
    ...(BUNDLE.validation?.domains ?? []),
    ...(BUNDLE.validation?.field_domains ?? []),
    ...(BUNDLE.validation?.collection_domains ?? []),
  ]) {
    const failure = domainDisposition(entry);
    if (failure) failures.push(failure);
  }
  assert.deepEqual(failures, []);
});

test("every artifact relation is dispositioned even when the bundle is quiet", () => {
  const missing = ARTIFACT.relations.map((relation) => relation.id).filter(
    (id) => !RELATION_FINDINGS[id]
  );
  assert.deepEqual(missing, []);
});
