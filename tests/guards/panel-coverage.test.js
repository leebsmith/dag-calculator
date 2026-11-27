// The panel is a read-only surface with three contracts: every panel-homed path
// appears exactly once across the strip, the context popover and the groups; every
// one of those paths exists in the generated surface manifest; and the details
// popover is the report's Equipment and Brewhouse list — same paths, labels and
// order — so the two surfaces cannot drift apart.

import test from "node:test";
import assert from "node:assert/strict";

import { panel } from "../../frontend/src/views/fieldsets.js";
import { context, groups, panelPaths, strip } from "../../frontend/src/views/panel.js";
import { surfaceManifest } from "../../frontend/src/views/registry/surface.generated.js";
import { artifact, read } from "./util.js";
import { dimensionOf } from "../../frontend/src/views/registry/catalog.js";
import { UNIT_DIMENSIONS } from "../../frontend/src/views/registry/units.js";

const PANEL = "frontend/src/partials/wall-panel.html";
const EQUIPMENT_TYP = "backend/app/templates/sections/equipment.typ";
const BREWHOUSE_TYP = "backend/app/templates/sections/brewhouse.typ";

function pairs(text) {
  return [...text.matchAll(/\(\s*"([^"]+)",\s*"([a-z_]+\.[a-z0-9_.]+)"/g)].map((match) => ({
    label: match[1],
    path: match[2],
  }));
}

function brewhouseRows() {
  const text = read(BREWHOUSE_TYP);
  const constraint = text.slice(text.indexOf("let constraint-rows = ("), text.indexOf("let scale-pin"));
  const explicit = text.slice(text.indexOf(") + constraint-rows + ("));
  return [...pairs(constraint), ...pairs(explicit)];
}

function typGroups(file) {
  const text = read(file);
  const found = [];
  for (const match of text.matchAll(/title:\s*"([^"]+)",\s*rows:\s*\(([\s\S]*?)\n\s*\),/g)) {
    const rows = [...match[2].matchAll(/\(\s*"([^"]+)",\s*"(equipment\.[a-z0-9_.]+)"/g)].map((row) => ({
      label: row[1],
      path: row[2],
    }));
    found.push({ title: match[1], rows });
  }
  return found;
}

test("every rendered panel path is declared once, read-only, and homed to the panel", () => {
  const declared = new Set(panelPaths);
  assert.equal(declared.size, panelPaths.length, "a panel path is declared twice");

  const missing = panelPaths.filter((path) => !surfaceManifest.paths[path]);
  assert.deepEqual(missing, [], "panel paths missing from the surface manifest");

  const editable = panelPaths.filter((path) => surfaceManifest.paths[path]?.isInput !== false);
  assert.deepEqual(editable, [], "a panel path is editable");

  const stripPaths = strip.map((cell) => cell.path);
  const equipment = context.equipment.flatMap((group) => group.rows.map((row) => row.path));
  const groupPaths = groups.flatMap((group) => (group.rows ?? []).map((row) => row.path));
  const unhomed = [...stripPaths, ...equipment, ...groupPaths].filter(
    (path) => !panel.includes(path)
  );
  assert.deepEqual(unhomed, [], "a rendered determination is not homed to the panel");
});

test("the strip is the six outcome cells, each a readout", () => {
  assert.deepEqual(
    strip.map((cell) => cell.id),
    ["abv", "og", "fg", "ibu", "srm", "ph"]
  );
  for (const cell of strip) {
    assert.equal(surfaceManifest.paths[cell.path]?.isInput, false, `${cell.path} is editable`);
  }
});

test("the details popover is the report's Equipment list", () => {
  const report = typGroups(EQUIPMENT_TYP).map(({ title, rows }) => ({ title, rows }));
  assert.deepEqual(
    context.equipment.map(({ title, rows }) => ({ title, rows })),
    report
  );
});

test("the details popover is the report's Brewhouse list", () => {
  assert.deepEqual(context.brewhouse, brewhouseRows());
});

test("the panel surface is read-only", () => {
  const markup = read(PANEL);
  for (const pattern of [/<input\b/, /<select\b/, /<textarea\b/, /@click=/, /@input=/, /@change=/]) {
    assert.doesNotMatch(markup, pattern, `wall-panel.html is editable: ${pattern}`);
  }
});

test("the rig facts are read-only identity paths", () => {
  const equipment = context.equipment.flatMap((group) => group.rows.map((row) => row.path));
  const editable = equipment.filter((path) => surfaceManifest.paths[path]?.isInput !== false);
  assert.deepEqual(editable, []);
});

test("each group is addressable for a wall hand-off", () => {
  assert.match(read(PANEL), /:data-panel-group="group\.id"/);
  assert.match(read(PANEL), /water-notes-section\.html/);
});

test("the groups are one exclusive accordion", () => {
  const names = [...read(PANEL).matchAll(/<details class="panel-group"[^>]*name="([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(names, ["panel-groups"]);
});

test("every water addition declares a small unit its dimension has", () => {
  const water = groups.find((group) => group.id === "water");
  const additions = water.rows.filter((row) => /additions\..*_(kg|l)$/.test(row.path));
  assert.equal(additions.length, 4, "a water addition row is missing from the group");

  for (const row of additions) {
    const expected = row.path.endsWith("_kg") ? "g" : "ml";
    assert.equal(row.unit, expected, `${row.path} must display in ${expected}`);
    const dimension = dimensionOf(artifact(), row.path);
    const dim = UNIT_DIMENSIONS.find((entry) => entry.id === dimension);
    assert.ok(
      dim?.units.some(([id]) => id === row.unit),
      `${row.path} has no "${row.unit}" in dimension "${dimension}"`
    );
  }
});

test("dose rows carry their small unit", () => {
  const water = groups.find((group) => group.id === "water");
  const doses = water.rows.filter((row) => row.unit);
  assert.deepEqual(
    doses.map((row) => [row.path.split(".").pop(), row.unit]),
    [
      ["gypsum_kg", "g"],
      ["cacl2_kg", "g"],
      ["acid_l", "ml"],
      ["acid_l", "ml"],
    ]
  );
});

test("the groups keep their declared shape", () => {
  assert.deepEqual(
    groups.map((group) => group.id),
    ["batch", "bitterness", "water", "style", "findings"]
  );
  for (const group of groups) {
    if (group.findings || group.computed) continue;
    assert.ok(group.rows.length > 0, `${group.id} has no rows`);
  }
});
