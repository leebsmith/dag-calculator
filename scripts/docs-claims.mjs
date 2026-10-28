// Claims, not prose: a living doc that names an artifact or bundle path in
// backticks is asserting that the path exists. Renaming a node without updating
// the docs that cite it is the most common documentation drift in this repo, and
// nothing else catches it. This guard resolves every backticked dotted token
// against the artifact, the primitive schemas, and the committed report bundle
// fixture, and fails on the ones that do not resolve.
//
// Namespaces that are neither — module names, frontend state, error-sink scopes,
// external libraries — are declared in FOREIGN with a reason, the same way
// `SHARED` declares a cross-owner read. A new namespace is a decision, not a
// silent exception. Plans may cite paths they propose: a `<!-- claims: proposed
// a.b c.d -->` declaration in that plan allows exactly those ids and nothing
// else.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildReportCatalog } from "../frontend/src/views/registry/catalog.js";
import { isFrozenPath } from "./precommit.mjs";
import { readArtifact } from "./artifact-inventory.mjs";

const TOKEN = /`([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)`/g;
const PROPOSED = /<!--\s*claims:\s*proposed\s+([^>]*)-->/;
const BUNDLE_FIXTURE = fileURLToPath(
  new URL("../tests/conformance/fixtures/report-bundle.json", import.meta.url)
);

const FILE_EXTENSIONS = new Set([
  "js",
  "mjs",
  "cjs",
  "ts",
  "py",
  "json",
  "toml",
  "md",
  "typ",
  "yaml",
  "yml",
  "sh",
  "css",
  "html",
  "txt",
]);

const STRUCTURAL = new Set(["fields", "outputs", "schema", "item_schema", "identity", "nodes"]);

// Boundary outputs are dotted keys, so the docs cite the sub-record bare
// (`cascade.v_strike`) as often as in full (`solver.batch.cascade.v_strike`).
// Resolve the short form against the boundary that owns it.
const ALIASES = {
  cascade: "solver.batch",
  hlt: "solver.batch",
  grist_buckets_kg: "solver.batch",
  prescription: "solver.water",
  mash_additions: "solver.water",
  sparge_additions: "solver.water",
  post_dose_mash_ions: "solver.water",
  post_salt_mash_ions: "solver.water",
  post_salt_hlt_ions: "solver.water",
};

// Heads that are deliberately not artifact or bundle paths.
export const FOREIGN = {
  app: "the backend package tree (app.services, app.schemas, app.recipe)",
  scipy: "the external solver library",
  sys: "the input namespace the solver reads",
  when: "the conditional-binding vocabulary in the template layer",
  yaml: "the recipe file format",
  tach: "the boundary checker's config file",
  pyproject: "a Python manifest",
  this: "JavaScript receiver syntax in a prose example",
  console: "a console method named in prose",
  state: "the producer's field-model state (valuation, roots, collections, selections)",
  cache: "the adapter's seed reference cache, read as cache.references.<catalog>",
  ctx: "the adapter context passed to a pure row formatter",
  options: "the selector option record",
  selection: "the selection node's record shape (selection.output.schema)",
  derived: "the derived-node record shape (derived.expr, derived.output)",
  boundary: "the boundary-node record shape (boundary.outputs)",
  output: "a boundary output spec key inside the artifact",
  grammar: "a prose reference to the artifact grammar",
  semantics: "a prose reference to the artifact semantics",
  dimensions: "the artifact's dimension table, cited without its section prefix",
  constants: "the artifact's constant table, cited without its section prefix",
  relations: "the artifact's relation table, cited without its section prefix",
  collection: "the collection node record shape (collection.fields)",
  domain: "a domain spec key inside the artifact",
  artifact: "the artifact file and its top-level sections",
  catalog: "the report catalog record",
  engine: "the frontend interpreter module",
  report: "the rendered report file and its template",
  recipe: "the recipe document format",
  malt: "a catalogue record cited by its schema name",
  sugar: "a catalogue record cited by its schema name",
  trace: "a trace row readout in prose",
  main: "a reportError scope name (main.session, main.auth, …)",
  recipes: "a reportError scope name (recipes.rename, recipes.trash, …)",
  library: "a reportError scope name (library.import …)",
  stepAdapter: "a reportError scope name (stepAdapter.duplicate …)",
};

function schemaClaims(artifact, claims) {
  for (const [schemaId, schema] of Object.entries(artifact.primitive_schemas)) {
    claims.add(schemaId);
    for (const field of Object.keys(schema)) claims.add(`${schemaId}.${field}`);
  }
}

function nodeClaims(artifact, claims) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    claims.add(id);
    const fields =
      node.kind === "collection"
        ? Object.keys(artifact.primitive_schemas[node.item_schema] ?? {})
        : node.kind === "selection"
          ? Object.keys(artifact.primitive_schemas[node.output?.schema] ?? {})
          : [];
    for (const field of fields) claims.add(`${id}.${field}`);
    for (const key of Object.keys(node.outputs ?? {})) claims.add(`${id}.${key}`);
    for (const key of Object.keys(node)) claims.add(`${id}.${key}`);
  }
}

function identityClaims(artifact, claims) {
  for (const [namespace, schemaId] of Object.entries(artifact.identity ?? {})) {
    claims.add(namespace);
    for (const field of Object.keys(artifact.primitive_schemas[schemaId] ?? {})) {
      claims.add(`${namespace}.${field}`);
    }
  }
}

function sectionClaims(artifact, claims) {
  for (const section of [
    "meta",
    "constants",
    "functions",
    "dimensions",
    "taxonomies",
    "primitive_schemas",
    "nodes",
    "relations",
  ]) {
    const table = artifact[section];
    claims.add(section);
    if (!table || typeof table !== "object") continue;
    for (const key of Array.isArray(table) ? table.map((entry) => entry.id) : Object.keys(table)) {
      claims.add(`${section}.${key}`);
    }
  }
}

function harvest(value, prefix, out) {
  if (Array.isArray(value)) {
    for (const item of value) harvest(item, prefix, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.add(path);
    harvest(nested, path, out);
  }
}

export function bundleClaims(fixture = JSON.parse(readFileSync(BUNDLE_FIXTURE, "utf8"))) {
  const claims = new Set();
  harvest(fixture, "", claims);
  for (const key of Object.keys(fixture)) claims.add(`bundle.${key}`);
  return claims;
}

// The report catalog renames some artifact ids on the way into a bundle
// (`batch.sugars` -> `grist.major_malts`, `water.target` ->
// `water.target_profile`), and the docs cite the bundle names.
export function catalogClaims(artifact) {
  return new Set(Object.keys(buildReportCatalog(artifact).nodes));
}

export function artifactClaims(artifact) {
  const claims = new Set();
  schemaClaims(artifact, claims);
  nodeClaims(artifact, claims);
  identityClaims(artifact, claims);
  sectionClaims(artifact, claims);
  return claims;
}

export function allClaims(artifact = readArtifact()) {
  return new Set([...artifactClaims(artifact), ...catalogClaims(artifact), ...bundleClaims()]);
}

function candidates(token) {
  const parts = token.split(".").filter((part) => !/^\d+$/.test(part));
  const stripped = parts.filter((part) => !STRUCTURAL.has(part));
  return new Set([token, parts.join("."), stripped.join(".")]);
}

export function resolves(token, claims) {
  if (FILE_EXTENSIONS.has(token.split(".").pop())) return true;
  const head = token.split(".")[0];
  const aliased = ALIASES[head] ? `${ALIASES[head]}.${token}` : null;
  for (const candidate of [...candidates(token), ...(aliased ? candidates(aliased) : [])]) {
    if (claims.has(candidate)) return true;
    if (FOREIGN[candidate.split(".")[0]]) return true;
  }
  return false;
}

export function claimsIn(text) {
  return [...text.matchAll(TOKEN)].map((match) => match[1]);
}

export function proposedIn(text) {
  const match = text.match(PROPOSED);
  return match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
}

export function isClaimDoc(path) {
  if (isFrozenPath(path)) return false;
  if (path.startsWith("plans/archive/")) return false;
  return path.startsWith("docs/") || path.startsWith("plans/");
}

export function claimFailures(files, claims = allClaims()) {
  const failures = [];
  for (const { path, text } of files) {
    const allowed = new Set(proposedIn(text));
    for (const token of claimsIn(text)) {
      if (allowed.has(token)) continue;
      if (resolves(token, claims)) continue;
      failures.push({ path, token });
    }
  }
  return failures;
}
