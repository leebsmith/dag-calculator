// The per-variety lupulin seed is only as good as the tables it transcribes.
// This guard parses §4 of the product record and fails when the seed and the
// document disagree, so a crop-year refresh cannot silently drift.

import test from "node:test";
import assert from "node:assert/strict";

import { read } from "./util.js";

const DOC = "docs/hops/hop-products.md";
const SEED = "data/seeds/hop-products.json";

function section(doc, heading) {
  const start = doc.indexOf(heading);
  assert.notEqual(start, -1, `${heading} is missing from ${DOC}`);
  const rest = doc.slice(start);
  const next = rest.slice(heading.length).search(/^### /m);
  return next === -1 ? rest : rest.slice(0, heading.length + next);
}

function rows(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells[0] !== "Variety" && !/^-+$/.test(cells[0]));
}

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function cryoTable(doc) {
  const table = new Map();
  for (const cells of rows(section(doc, "### 4.1"))) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const name = cells[i];
      const alpha = cells[i + 1];
      if (!name) continue;
      const match = alpha.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)$/u);
      assert.ok(match, `unparsed Cryo range for ${name}: "${alpha}"`);
      table.set(name, { min: Number(match[1]), max: Number(match[2]) });
    }
  }
  return table;
}

function alphaTable(doc, heading) {
  const table = new Map();
  for (const cells of rows(section(doc, heading))) {
    const [name, alpha] = cells;
    const value = Number(alpha);
    if (name && Number.isFinite(value)) table.set(name, value);
  }
  return table;
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("the lupulin seed matches the product record's per-variety tables", () => {
  const doc = read(DOC);
  const seed = JSON.parse(read(SEED));
  const lupulin = Object.values(seed).filter((row) => row.product_form === "lupulin_pellet");
  const byId = new Map(lupulin.map((row) => [row.id, row]));

  const cryo = cryoTable(doc);
  const lupomax2025 = alphaTable(doc, "### 4.2");
  const lupomax2023 = alphaTable(doc, "### 4.3");

  assert.equal(cryo.size, 26, "§4.1 should list 26 Cryo varieties");
  assert.equal(lupomax2025.size, 12, "§4.2 should list 12 Lupomax figures");
  assert.equal(lupomax2023.size, 16, "§4.3 should list 16 Lupomax figures");

  for (const [name, range] of cryo) {
    const row = byId.get(`cryo-${slug(name)}`);
    assert.ok(row, `missing seed row for Cryo ${name}`);
    assert.equal(row.name, `Cryo ${name}`);
    assert.equal(row.manufacturer, "Yakima Chief Hops");
    assert.ok(close(row.alpha_acid_min_pct, range.min / 100), `Cryo ${name} min`);
    assert.ok(close(row.alpha_acid_max_pct, range.max / 100), `Cryo ${name} max`);
    assert.ok(
      close(row.alpha_acid_pct, (range.min + range.max) / 200),
      `Cryo ${name} preset is not the range midpoint`
    );
  }

  const lupomaxNames = new Set([...lupomax2025.keys(), ...lupomax2023.keys()]);
  for (const name of lupomaxNames) {
    const alpha = lupomax2025.get(name) ?? lupomax2023.get(name);
    const row = byId.get(`lupomax-${slug(name)}`);
    assert.ok(row, `missing seed row for Lupomax ${name}`);
    assert.equal(row.name, `Lupomax ${name}`);
    assert.equal(row.manufacturer, "BarthHaas");
    assert.ok(close(row.alpha_acid_pct, alpha / 100), `Lupomax ${name} preset`);
    assert.equal(row.alpha_acid_min_pct, undefined, `Lupomax ${name} should carry no range`);
    assert.equal(row.alpha_acid_max_pct, undefined, `Lupomax ${name} should carry no range`);
  }

  assert.equal(
    lupulin.length,
    cryo.size + lupomaxNames.size,
    "the seed carries a lupulin row the document does not price"
  );
  assert.ok(!byId.has("cryo-hops"), "the variety-agnostic Cryo row should be gone");
  assert.ok(!byId.has("lupomax"), "the variety-agnostic Lupomax row should be gone");

  for (const name of ["Dolcita", "HBC 1019", "Krush"]) {
    assert.ok(
      !byId.has(`lupomax-${slug(name)}`),
      `Lupomax ${name} publishes no alpha and should not be seeded`
    );
  }
});
