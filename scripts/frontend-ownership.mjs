// Ownership index for the single Alpine reactive root: which installer declares
// which app member, which card partials it owns, and every cross-owner read the
// `SHARED` interface permits. Shared by the generator and the drift guard so
// `docs/frontend-ownership.md` can never disagree with the contract.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createStepApp } from "../frontend/src/adapters/stepAdapter.js";
import { INSTALLERS, SHARED } from "../frontend/src/adapters/installers.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PARTIAL_DIR = "frontend/src/partials";
const ROOT_TEMPLATE = "frontend/index.html";

const BINDING_ATTR = /\s(?:x-[\w:.-]+|@[\w.:-]+|:[\w.-]+)=(?:"([^"]*)"|'([^']*)')/g;
const IDENTIFIER = /(?<![\w$.'])([A-Za-z_$][\w$]*)/g;
const MEMBER_READ = /\b(?:this|app)\.([A-Za-z_$][\w$]*)/g;
const CARD_PARTIAL = /^(?:step-.*|modal-.*|mash-rests-modal)\.html$/;

function read(path) {
  return readFileSync(ROOT + path, "utf8");
}

function add(map, outer, inner, value) {
  if (!map.has(outer)) map.set(outer, new Map());
  const bucket = map.get(outer);
  if (!bucket.has(inner)) bucket.set(inner, new Set());
  bucket.get(inner).add(value);
}

export function cardPartialFiles() {
  return readdirSync(ROOT + PARTIAL_DIR)
    .filter((file) => file.endsWith(".html") && CARD_PARTIAL.test(file))
    .sort();
}

function templateFiles() {
  return [
    ROOT_TEMPLATE,
    ...readdirSync(ROOT + PARTIAL_DIR)
      .filter((file) => file.endsWith(".html"))
      .sort()
      .map((file) => `${PARTIAL_DIR}/${file}`),
  ];
}

/** @returns {Map<string, string>} app member → declaring installer */
export function ownerIndex(installers = INSTALLERS) {
  const owners = new Map();
  for (const { name, keys } of installers) {
    for (const key of keys) owners.set(key, name);
  }
  return owners;
}

/** @returns {Map<string, Set<string>>} card partial → declaring installers */
export function partialOwners(installers = INSTALLERS) {
  const owners = new Map();
  for (const { name, partials = [] } of installers) {
    for (const partial of partials) {
      if (!owners.has(partial)) owners.set(partial, new Set());
      owners.get(partial).add(name);
    }
  }
  return owners;
}

function bindingIdentifiers(file) {
  const names = new Set();
  for (const match of read(file).matchAll(BINDING_ATTR)) {
    for (const name of (match[1] ?? match[2] ?? "").matchAll(IDENTIFIER)) names.add(name[1]);
  }
  return names;
}

/** @returns {Map<string, Map<string, Set<string>>>} installer → key → sources */
export function moduleReads(installers = INSTALLERS) {
  const owners = ownerIndex(installers);
  const reads = new Map();
  for (const { name, modules = [] } of installers) {
    for (const module of modules) {
      for (const match of read(module).matchAll(MEMBER_READ)) {
        const key = match[1];
        if (!owners.has(key) || owners.get(key) === name) continue;
        add(reads, name, key, module);
      }
    }
  }
  return reads;
}

/** @returns {Map<string, Map<string, Set<string>>>} installer → key → card partials */
export function partialReads(installers = INSTALLERS) {
  const owners = ownerIndex(installers);
  const reads = new Map();
  for (const [partial, group] of partialOwners(installers)) {
    for (const key of bindingIdentifiers(`${PARTIAL_DIR}/${partial}`)) {
      if (!owners.has(key) || group.has(owners.get(key))) continue;
      for (const reader of group) add(reads, reader, key, partial);
    }
  }
  return reads;
}

/** @returns {Map<string, Map<string, Set<string>>>} key → reader → sources */
export function foreignReads(installers = INSTALLERS) {
  const merged = new Map();
  for (const reads of [moduleReads(installers), partialReads(installers)]) {
    for (const [reader, keys] of reads) {
      for (const [key, sources] of keys) {
        for (const source of sources) add(merged, key, reader, source);
      }
    }
  }
  return merged;
}

/** @returns {Map<string, number>} app member → number of templates binding it */
export function templateUsage() {
  const owners = ownerIndex();
  const usage = new Map();
  for (const file of templateFiles()) {
    for (const key of bindingIdentifiers(file)) {
      if (!owners.has(key)) continue;
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }
  return usage;
}

/**
 * Every ownership rule the guard enforces. All buckets are empty on a healthy
 * tree; each message names the file that broke the rule.
 *
 * @returns {Record<string, string[]>}
 */
export function ownershipGaps(installers = INSTALLERS, shared = SHARED) {
  const owners = ownerIndex(installers);
  const partials = partialOwners(installers);
  const foreign = foreignReads(installers);
  const knownReaders = new Set(installers.map(({ name }) => name));
  const byKey = new Map();
  const duplicateShared = [];
  const staleShared = [];

  for (const entry of shared) {
    if (byKey.has(entry.key)) duplicateShared.push(entry.key);
    byKey.set(entry.key, entry);
    if (!owners.has(entry.key)) {
      staleShared.push(`${entry.key}: not declared by any installer`);
      continue;
    }
    if (!entry.reason || entry.reason.length < 12) {
      staleShared.push(`${entry.key}: missing a reason`);
    }
    const actual = foreign.get(entry.key) ?? new Map();
    if (actual.size === 0) staleShared.push(`${entry.key}: no cross-owner read left`);
    for (const reader of entry.owners) {
      if (!knownReaders.has(reader)) {
        staleShared.push(`${entry.key}: unknown reader ${reader}`);
      } else if (owners.get(entry.key) === reader) {
        staleShared.push(`${entry.key}: lists its declaring installer ${reader}`);
      } else if (!actual.has(reader)) {
        staleShared.push(`${entry.key}: declares ${reader}, which no longer reads it`);
      }
    }
    for (const reader of actual.keys()) {
      if (!entry.owners.includes(reader)) {
        staleShared.push(`${entry.key}: ${reader} reads it without being listed`);
      }
    }
  }

  const undeclared = [];
  for (const [key, readers] of foreign) {
    for (const reader of readers.keys()) {
      if (!byKey.has(key)) undeclared.push(`${reader} reads ${key} (owned by ${owners.get(key)})`);
    }
  }

  const missingModules = installers
    .flatMap(({ name, modules = [] }) =>
      modules.filter((module) => !existsSync(ROOT + module)).map((module) => `${name}: ${module}`)
    );
  const missingPartials = [...partials.keys()]
    .filter((partial) => !existsSync(`${ROOT}${PARTIAL_DIR}/${partial}`))
    .map((partial) => `${partial}`);
  const unownedPartials = cardPartialFiles()
    .filter((partial) => !partials.has(partial))
    .map((partial) => `${PARTIAL_DIR}/${partial}`);
  const shellPartials = [...partials.keys()].filter((partial) => !CARD_PARTIAL.test(partial));

  return {
    duplicateShared,
    staleShared,
    undeclared,
    missingModules,
    missingPartials,
    unownedPartials,
    shellPartials,
  };
}

function sortedEntries(map) {
  return [...map].sort(([a], [b]) => a.localeCompare(b));
}

export function buildOwnershipIndex(installers = INSTALLERS, shared = SHARED) {
  const app = createStepApp();
  const enumerable = new Set(Object.keys(app));
  const owners = ownerIndex(installers);
  const partials = partialOwners(installers);
  const foreign = foreignReads(installers);
  const usage = templateUsage();
  const members = installers.flatMap(({ keys }) => keys);
  const hidden = members.filter((key) => !enumerable.has(key));
  const readingInstallers = installers.filter(({ name }) =>
    [...foreign.values()].some((readers) => readers.has(name))
  );

  const lines = [];
  lines.push("# Frontend app ownership");
  lines.push("");
  lines.push("Generated from `frontend/src/adapters/installers.js` — do not edit by hand.");
  lines.push("Re-sync after any installer change: `node scripts/emit-ownership-index.mjs`.");
  lines.push("");
  lines.push(`- Declared members: **${members.length}** (${members.length - hidden.length} enumerable, ${hidden.length} hidden)`);
  lines.push(`- Installers: **${installers.length}**`);
  lines.push(`- Card partials: **${partials.size}**`);
  lines.push(`- Installers reading another installer's key: **${readingInstallers.length} of ${installers.length}**`);
  lines.push(`- Cross-owner keys declared in \`SHARED\`: **${shared.length}**`);
  lines.push("");

  lines.push("## Installers");
  lines.push("");
  lines.push("| installer | modules | members | card partials | foreign reads |");
  lines.push("|---|---|---|---|---|");
  for (const { name, modules = [], keys, partials: owned = [] } of installers) {
    const reads = [...foreign.values()].filter((readers) => readers.has(name));
    lines.push(
      `| \`${name}\` | ${modules.map((m) => `\`${m}\``).join(", ")} | ${keys.length} | ${owned.length} | ${reads.length} |`
    );
  }
  lines.push("");

  lines.push("## Members");
  lines.push("");
  lines.push("| member | owner | surface | templates |");
  lines.push("|---|---|---|---|");
  for (const key of [...members].sort()) {
    const surface = enumerable.has(key) ? "public" : "hidden";
    lines.push(`| \`${key}\` | \`${owners.get(key)}\` | ${surface} | ${usage.get(key) ?? 0} |`);
  }
  lines.push("");

  lines.push("## Cross-owner reads");
  lines.push("");
  lines.push("| key | owner | readers | reason |");
  lines.push("|---|---|---|---|");
  for (const { key, owners: readers, reason } of [...shared].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      `| \`${key}\` | \`${owners.get(key)}\` | ${readers.map((r) => `\`${r}\``).join(", ")} | ${reason} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}
