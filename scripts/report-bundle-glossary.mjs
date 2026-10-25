// Build docs/report-bundle-glossary.md from the artifact + presentation
// registries. Pure: the emitter script and the drift guard share this.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveReference } from "../frontend/src/engine/paths.js";
import { buildReportCatalog } from "../frontend/src/views/registry/catalog.js";
import { UNIT_SYMBOLS } from "../frontend/src/views/registry/units.js";

const GROUP_ORDER = [
  "batch",
  "grist",
  "mash",
  "water",
  "solver.batch",
  "solver.water",
  "solver.hops",
  "equipment",
  "style",
];

const GROUP_TITLES = {
  batch: "Batch & grist inputs",
  grist: "Grist",
  mash: "Mash",
  water: "Water chemistry",
  "solver.batch": "Solver — batch sparge",
  "solver.water": "Solver — water chemistry",
  "solver.hops": "Solver — hop bitterness",
  equipment: "Identity — equipment",
  style: "Identity — style",
};

function groupFor(path) {
  return path.startsWith("solver.") ? path.split(".").slice(0, 2).join(".") : path.split(".")[0];
}

function kindOf(artifact, path) {
  const ref = resolveReference(artifact, path);
  if (!ref) return "unknown";
  if (ref.kind === "identity") return "identity";
  const node = artifact.nodes[ref.nodeId];
  if (ref.suffix.length === 0) return node.kind;
  if (node.kind === "boundary") return "output";
  if (node.kind === "selection" || node.kind === "collection") return "field";
  return "unknown";
}

function unitCell(entry) {
  if (!entry.unit) return "—";
  const symbol = UNIT_SYMBOLS[entry.dimension]?.[entry.unit];
  return symbol && symbol !== entry.unit ? `${entry.unit} (${symbol})` : entry.unit;
}

function dash(value) {
  return value === null || value === undefined ? "—" : String(value);
}

export function readArtifact() {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL("../data/artifact.json", import.meta.url)), "utf8")
  );
}

export function buildGlossary(artifact) {
  const catalog = buildReportCatalog(artifact);
  const groups = new Map();

  for (const path of Object.keys(catalog.nodes).sort()) {
    const group = groupFor(path);
    if (!groups.has(group)) groups.set(group, []);
    const entry = catalog.nodes[path];
    groups.get(group).push({
      path,
      label: entry.label,
      kind: kindOf(artifact, path),
      dimension: dash(entry.dimension),
      unit: unitCell(entry),
      decimals: dash(entry.decimals),
      options: entry.options?.length ? entry.options.join(", ") : "—",
    });
  }

  const ordered = [
    ...GROUP_ORDER.filter((group) => groups.has(group)),
    ...[...groups.keys()].filter((group) => !GROUP_ORDER.includes(group)).sort(),
  ];

  const lines = [
    "# Report bundle glossary",
    "",
    "Generated from `data/artifact.json` and the presentation registries — do not",
    "edit by hand. Regenerate after any artifact, registry, or step-label change:",
    "",
    "```bash",
    "node scripts/emit-report-bundle-glossary.mjs",
    "```",
    "",
    "Every path a bundle can expose is listed once. Read the value with the path",
    "rule in [`report-bundle.md`](report-bundle.md) §3: node ids are keys in",
    "`state.valuation`; a dotted suffix reads into a boundary output map, a",
    "selection field, or a collection row. `identity` rows live under",
    "`batch.identity`.",
    "",
    "Numbers are **base-unit** values. Convert with `catalog.dimensions[dimension]`",
    "and the `unit` id in this table, then round to `decimals` (see",
    "[`report-bundle.md`](report-bundle.md) §4). `options` are taxonomy values from",
    "`catalog.nodes[path].options`; display labels are in `option_labels`.",
    "",
    "Kind legend: `root` / `choice` / `derived` / `selection` / `collection` /",
    "`boundary` are nodes; `output` is a boundary output; `field` is a selection or",
    "collection field; `identity` is a component field.",
    "",
  ];

  for (const group of ordered) {
    const rows = groups.get(group);
    lines.push(`## ${GROUP_TITLES[group] ?? `\`${group}\``}`, "");
    lines.push(`_${rows.length} path${rows.length === 1 ? "" : "s"}_`, "");
    lines.push("| Path | Label | Kind | Dimension | Unit | Decimals | Options |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of rows) {
      lines.push(
        `| \`${row.path}\` | ${row.label} | ${row.kind} | ${row.dimension} | ${row.unit} | ${row.decimals} | ${row.options} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
