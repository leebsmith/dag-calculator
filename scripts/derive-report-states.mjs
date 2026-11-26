import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGraph } from "../frontend/src/engine/dag.js";

const BUNDLE = "tests/conformance/fixtures/report-bundle.json";
const ARTIFACT = "data/artifact.json";
const DEFAULT_OUT = "tests/conformance/fixtures/report-states";

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"));
}

function ownerOf(path, artifact, namespaces) {
  const namespace = namespaces.find((ns) => path === ns || path.startsWith(`${ns}.`));
  if (namespace) return { identity: true, node: null };
  const parts = path.split(".");
  for (let index = parts.length; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    if (artifact.nodes[id]) return { identity: false, node: id };
  }
  return null;
}

function ancestors(id, graph) {
  const seen = new Set();
  const queue = [...(graph.adjacency[id] ?? [])];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.adjacency[current] ?? []) if (!seen.has(next)) queue.push(next);
  }
  return seen;
}

function keepsDraft(owner, artifact) {
  if (!owner) return false;
  if (owner.identity) return true;
  return ["root", "choice"].includes(artifact.nodes[owner.node].kind);
}

function keepsWater(owner, artifact, graph) {
  if (!owner) return false;
  if (owner.identity) return true;
  if (owner.node === "solver.water") return false;
  return !ancestors(owner.node, graph).has("solver.water");
}

function filtered(bundle, artifact, namespaces, graph, keep) {
  return Object.fromEntries(
    Object.entries(bundle.formatted).filter(([path]) =>
      keep(ownerOf(path, artifact, namespaces), artifact, graph)
    )
  );
}

function tableEntries(bundle, keep, artifact, graph) {
  const isCollection = (id) => artifact.nodes[id]?.kind === "collection";
  return {
    formatted_tables: Object.fromEntries(
      Object.entries(bundle.formatted_tables).filter(([id]) =>
        isCollection(id) ? keep({ identity: false, node: id }, artifact, graph) : false
      )
    ),
    formatted_summaries: Object.fromEntries(
      Object.entries(bundle.formatted_summaries).filter(([id]) =>
        id === "overall" ? true : keep({ identity: false, node: id }, artifact, graph)
      )
    ),
  };
}

function build() {
  const bundle = readJson(BUNDLE);
  const artifact = readJson(ARTIFACT);
  const namespaces = Object.keys(artifact.identity ?? {});
  const graph = buildGraph(artifact);
  const keepDraft = (owner, source) => keepsDraft(owner, source);
  const keepWater = (owner, source, graphRef) => keepsWater(owner, source, graphRef);

  const draftTables = tableEntries(bundle, keepDraft, artifact, graph);
  const waterTables = tableEntries(bundle, keepWater, artifact, graph);

  return {
    "draft-before-solve": {
      name: "draft-before-solve",
      derived_from: BUNDLE,
      description:
        "a draft before its first solve: authored roots, choices and identity only; no tables or boundary readouts",
      formatted: filtered(bundle, artifact, namespaces, graph, keepDraft),
      formatted_tables: draftTables.formatted_tables,
      formatted_summaries: draftTables.formatted_summaries,
      validation: { relations: [], domains: [], field_domains: [], collection_domains: [] },
    },
    "water-unavailable": {
      name: "water-unavailable",
      derived_from: BUNDLE,
      description:
        "the water boundary did not resolve: its outputs and every value downstream of it are absent, and two checks are failing",
      formatted: filtered(bundle, artifact, namespaces, graph, keepWater),
      formatted_tables: waterTables.formatted_tables,
      formatted_summaries: waterTables.formatted_summaries,
      validation: {
        ...bundle.validation,
        relations: [...bundle.validation.relations, { id: "kettle_not_overfilled", holds: false }],
        domains: [...bundle.validation.domains, { nodeId: "batch.target_abv", bounded: true, holds: false }],
      },
    },
  };
}

function main() {
  const outIndex = process.argv.indexOf("--out");
  const directory =
    outIndex === -1
      ? fileURLToPath(new URL(`../${DEFAULT_OUT}`, import.meta.url))
      : process.argv[outIndex + 1];
  const states = build();
  mkdirSync(directory, { recursive: true });
  for (const [name, state] of Object.entries(states)) {
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(state, null, 2) + "\n");
  }
  console.log(
    `report states: wrote ${Object.keys(states).length} fixtures to ${directory} ` +
      `(${Object.entries(states)
        .map(([name, state]) => `${name}: ${Object.keys(state.formatted).length}`)
        .join(", ")})`
  );
}

main();
