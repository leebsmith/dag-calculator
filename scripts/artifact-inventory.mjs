// Canonical inventory of `data/artifact.json`, shared by the generator and the
// drift guard so the doc can never disagree with the artifact.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readArtifact() {
  const url = new URL("../data/artifact.json", import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

// Deterministic JSON with sorted object keys (so regeneration is byte-stable).
function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      sortedKeys(value)
        .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function unitSpec(unit) {
  if ("factor" in unit && "offset" in unit) return `factor ${unit.factor}, offset ${unit.offset}`;
  if ("factor" in unit) return `factor ${unit.factor}`;
  if ("fwd" in unit) return `fwd ${unit.fwd}, inv ${unit.inv}`;
  return stableStringify(unit);
}

function fieldSpec(spec) {
  const parts = [];
  if (spec.dimension) parts.push(`dimension ${spec.dimension}`);
  if (spec.taxonomy) parts.push(`taxonomy ${spec.taxonomy}`);
  if (spec.type) parts.push(`type ${spec.type}`);
  if (spec.item_schema) parts.push(`item_schema ${spec.item_schema}`);
  if (spec.domain) parts.push(`domain ${stableStringify(spec.domain)}`);
  if (spec.default !== undefined) parts.push(`default ${stableStringify(spec.default)}`);
  return parts.join(", ") || "—";
}

export function buildInventory(artifact) {
  const lines = [];
  lines.push("# Artifact inventory");
  lines.push("");
  lines.push("Generated from `data/artifact.json` — do not edit by hand. Re-sync after");
  lines.push("any artifact change: `node scripts/emit-artifact-inventory.mjs`.");
  lines.push("");
  lines.push(`- \`schema_version\`: **${artifact.schema_version}**`);
  lines.push("");

  lines.push("## Dimensions");
  lines.push("");
  lines.push("| id | base_unit | kind | units |");
  lines.push("|---|---|---|---|");
  for (const id of sortedKeys(artifact.dimensions)) {
    const d = artifact.dimensions[id];
    const units =
      sortedKeys(d.units).map((u) => `\`${u}\` (${unitSpec(d.units[u])})`).join(", ") || "—";
    lines.push(`| \`${id}\` | \`${d.base_unit}\` | ${d.kind} | ${units} |`);
  }
  lines.push("");

  lines.push("## Taxonomies");
  lines.push("");
  lines.push("| id | values |");
  lines.push("|---|---|");
  for (const id of sortedKeys(artifact.taxonomies)) {
    lines.push(`| \`${id}\` | ${artifact.taxonomies[id].map((v) => `\`${v}\``).join(", ")} |`);
  }
  lines.push("");

  lines.push("## Primitive schemas");
  lines.push("");
  lines.push("| id | fields |");
  lines.push("|---|---|");
  for (const id of sortedKeys(artifact.primitive_schemas)) {
    const schema = artifact.primitive_schemas[id];
    const fields = sortedKeys(schema)
      .map((f) => `\`${f}\` (${fieldSpec(schema[f])})`)
      .join(", ");
    lines.push(`| \`${id}\` | ${fields} |`);
  }
  lines.push("");

  lines.push("## Functions");
  lines.push("");
  lines.push("| id | params | returns |");
  lines.push("|---|---|---|");
  for (const id of sortedKeys(artifact.functions)) {
    const fn = artifact.functions[id];
    lines.push(`| \`${id}\` | ${fn.params.join(", ")} | \`${fn.returns}\` |`);
  }
  lines.push("");

  lines.push("## Constants");
  lines.push("");
  lines.push("| id | value | dimension |");
  lines.push("|---|---|---|");
  for (const id of sortedKeys(artifact.constants)) {
    const c = artifact.constants[id];
    lines.push(`| \`${id}\` | ${stableStringify(c.value)} | \`${c.dimension ?? ""}\` |`);
  }
  lines.push("");

  lines.push("## Nodes");
  lines.push("");
  lines.push("| id | kind |");
  lines.push("|---|---|");
  for (const id of sortedKeys(artifact.nodes)) {
    lines.push(`| \`${id}\` | ${artifact.nodes[id].kind} |`);
  }
  lines.push("");

  const fielded = sortedKeys(artifact.nodes).filter(
    (id) => artifact.nodes[id].kind === "collection" && artifact.nodes[id].fields
  );
  if (fielded.length) {
    lines.push("## Collection computed fields");
    lines.push("");
    lines.push("| collection | field | output | inputs | expr |");
    lines.push("|---|---|---|---|---|");
    for (const id of fielded) {
      for (const [name, spec] of Object.entries(artifact.nodes[id].fields)) {
        const inputs = sortedKeys(spec.inputs ?? {})
          .map((alias) => `${alias} ← \`${spec.inputs[alias]}\``)
          .join(", ");
        lines.push(
          `| \`${id}\` | \`${name}\` | ${fieldSpec(spec.output)} | ${inputs || "—"} | \`${stableStringify(spec.expr)}\` |`
        );
      }
    }
    lines.push("");
  }

  lines.push("## Relations");
  lines.push("");
  lines.push("| id | blocking |");
  lines.push("|---|---|");
  for (const relation of [...(artifact.relations ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    lines.push(`| \`${relation.id}\` | ${relation.blocking} |`);
  }
  lines.push("");

  return lines.join("\n") + "\n";
}
