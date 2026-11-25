import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROOT, artifact, read } from "./util.js";

const ARTIFACT = artifact();
const SURFACE = JSON.parse(read("data/surface.json"));
const CONTRACT = JSON.parse(read("data/authoring.json"));

const ACTIONS = new Set(["set", "override", "choose", "pick", "edit-table"]);
const CONSTRAINTS = new Set(["none", "domain", "taxonomy", "component", "schema"]);

function expectedAction(node, inherited) {
  if (node.kind === "collection") return "edit-table";
  if (node.kind === "selection") return "pick";
  if (node.kind === "root" && node.dimension === "reference") return "pick";
  if (node.kind === "choice") return "choose";
  return inherited ? "override" : "set";
}

function expectedConstraint(node) {
  if (node.kind === "collection") return "schema";
  if (node.kind === "selection") return "component";
  if (node.kind === "root" && node.dimension === "reference") return "component";
  if (node.kind === "choice") return "taxonomy";
  return node.domain ? "domain" : "none";
}

function failures(contract, source, surface) {
  const found = [];
  const expected = Object.entries(source.nodes)
    .filter(([, node]) => ["root", "choice", "collection", "selection"].includes(node.kind))
    .map(([id]) => id);
  const declared = new Set(Object.keys(contract.actions ?? {}));
  const inherited = new Set(Object.keys(surface.roots.inherited ?? {}));

  for (const id of expected) if (!declared.has(id)) found.push(`missing action for "${id}"`);
  for (const id of declared) if (!expected.includes(id)) found.push(`"${id}" is not authorable`);

  for (const [id, entry] of Object.entries(contract.actions ?? {})) {
    const node = source.nodes[id];
    if (!node) continue;
    if (!ACTIONS.has(entry.action)) found.push(`"${id}" has unknown action "${entry.action}"`);
    if (!CONSTRAINTS.has(entry.constraint)) {
      found.push(`"${id}" has unknown constraint "${entry.constraint}"`);
    }
    if (typeof entry.note !== "string" || entry.note.trim() === "") {
      found.push(`"${id}" has no note`);
    }
    const action = expectedAction(node, inherited.has(id));
    if (entry.action !== action) {
      found.push(`"${id}" action is "${entry.action}", expected "${action}"`);
    }
    const constraint = expectedConstraint(node);
    if (entry.constraint !== constraint) {
      found.push(`"${id}" constraint is "${entry.constraint}", expected "${constraint}"`);
    }
    for (const name of entry.transform ?? []) {
      if (!contract.transforms?.[name]) found.push(`"${id}" names unknown transform "${name}"`);
    }
  }

  for (const [name, spec] of Object.entries(contract.transforms ?? {})) {
    if (typeof spec.when !== "string" || spec.when.trim() === "") {
      found.push(`transform "${name}" has no when`);
    }
    if (!spec.owner || !existsSync(join(ROOT, spec.owner))) {
      found.push(`transform "${name}" has no owner file`);
    }
  }
  return found;
}

test("every authorable node has one action with its constraint", () => {
  assert.deepEqual(failures(CONTRACT, ARTIFACT, SURFACE), []);
});

test("a new root without an action fails", () => {
  const mutated = structuredClone(ARTIFACT);
  mutated.nodes["batch.authoring_probe"] = {
    kind: "root",
    dimension: "percentage",
    default: "0.5",
  };

  assert.ok(
    failures(CONTRACT, mutated, SURFACE).includes('missing action for "batch.authoring_probe"')
  );
});

test("an action that disagrees with the node kind fails", () => {
  const mutated = structuredClone(CONTRACT);
  mutated.actions["batch.topology"].action = "set";

  assert.ok(
    failures(mutated, ARTIFACT, SURFACE).includes(
      '"batch.topology" action is "set", expected "choose"'
    )
  );
});

test("an unknown transform fails", () => {
  const mutated = structuredClone(CONTRACT);
  mutated.actions["grist.major_malts"].transform = ["unlisted-transform"];

  assert.ok(
    failures(mutated, ARTIFACT, SURFACE).includes(
      '"grist.major_malts" names unknown transform "unlisted-transform"'
    )
  );
});
