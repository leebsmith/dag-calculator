// The report section registry: parse the literal in report.typ, derive the
// generated section table, and check the contract between the registry and the
// files under sections/. Pure: the emitter, the guard, and the docs share this.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../backend/app/templates/", import.meta.url));
const REPORT = "report.typ";
const SECTIONS_DIR = "sections";

const BEGIN = "// === registry:begin ===";
const END = "// === registry:end ===";

const ENTRY =
  /^\s*\(id:\s*"([a-z0-9][a-z0-9-]*)",\s*title:\s*"([^"]+)",\s*present:\s*([A-Za-z0-9_-]+),\s*render:\s*([A-Za-z0-9_-]+)\),?\s*$/;

export function parseRegistry(source, name = REPORT) {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${name}: registry markers are missing or out of order`);
  }
  const block = source.slice(start + BEGIN.length, end);
  const entries = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;
    if (line.startsWith("#let sections = (") || line === ")") continue;
    const match = ENTRY.exec(raw);
    if (!match) {
      throw new Error(`${name}: unparsable registry entry: ${line}`);
    }
    const [, id, title, present, render] = match;
    entries.push({ id, title, present, render });
  }
  return entries;
}

export function readRegistry(templatesDir = TEMPLATES) {
  return parseRegistry(readFileSync(`${templatesDir}${REPORT}`, "utf8"));
}

export function readSectionFiles(templatesDir = TEMPLATES) {
  try {
    return readdirSync(`${templatesDir}${SECTIONS_DIR}`)
      .filter((file) => file.endsWith(".typ"))
      .map((file) => file.slice(0, -".typ".length))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

// One entry per file and one file per entry, filename equal to id, no duplicate
// ids, and both functions named. An entry without a presence predicate is how a
// section silently renders nothing.
export function findContractViolations(sections, files) {
  const violations = [];
  const seen = new Set();
  for (const section of sections) {
    if (seen.has(section.id)) violations.push(`duplicate section id "${section.id}"`);
    seen.add(section.id);
    if (section.title.trim() === "") violations.push(`section "${section.id}" has no title`);
    if (!section.present) violations.push(`section "${section.id}" has no presence predicate`);
    if (!section.render) violations.push(`section "${section.id}" has no render function`);
    if (!files.includes(section.id)) {
      violations.push(`section "${section.id}" has no ${SECTIONS_DIR}/${section.id}.typ`);
    }
  }
  for (const file of files) {
    if (!seen.has(file)) violations.push(`${SECTIONS_DIR}/${file}.typ is not in the registry`);
  }
  return violations;
}

export function buildSectionsDoc(sections) {
  const lines = [
    "# Report sections",
    "",
    "Generated from the registry literal in",
    "[`backend/app/templates/report.typ`](../backend/app/templates/report.typ) — do",
    "not edit by hand. Regenerate after adding, removing, or reordering a section:",
    "",
    "```bash",
    "node scripts/emit-report-sections.mjs",
    "```",
    "",
    "**Registry order is canonical render order.** The report spec selects a subset",
    "by id (`sections=a,b`); it cannot reorder. A row's position is therefore the",
    "section's position in every report.",
    "",
    "Presence predicates decide whether a requested section renders at all",
    "(`include = requested ∧ present`), keyed off output existence rather than",
    "value so an unsolved boundary never renders plausible zeros. The authoring",
    "checklist is [`adding-a-section.md`](adding-a-section.md).",
    "",
  ];

  if (sections.length === 0) {
    lines.push(
      "No sections are registered yet. The document renders its chrome, identity",
      "block, and ancestry footer from the bundle alone; sections land one commit",
      "at a time."
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push("| # | id | title | presence | source |");
  lines.push("|---|---|---|---|---|");
  sections.forEach((section, index) => {
    lines.push(
      `| ${index + 1} | \`${section.id}\` | ${section.title} | \`${section.present}\` | ` +
        `[\`sections/${section.id}.typ\`](../backend/app/templates/sections/${section.id}.typ) |`
    );
  });
  lines.push("");
  return lines.join("\n");
}

export { SECTIONS_DIR, TEMPLATES };
