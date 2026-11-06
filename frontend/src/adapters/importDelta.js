// The delta table: what the page said, next to what this rig will actually use.
//
// This is the feature's whole claim. A magazine's masses cannot survive import —
// efficiency, malt specs, hop utilization and yeast attenuation are ours, not
// theirs — so the honest output is a per-line comparison with the reason each
// difference exists, not a number that looks like the page.
//
// Reading is pure: the engine is passed in already solved by the gate.

import { ignoreError } from "../observability.js";
import artifact from "../engine/artifact.json" with { type: "json" };
import { toBase } from "../engine/units.js";
import { formatWithDecimals } from "../utils/format.js";
import { unitDecimals } from "../views/registry/units.js";
import { massKg } from "../views/import/ledger.js";
import { unitSymbol } from "../views/import/review.js";

const KG_TO_G = 1000;

// The extraction's unit ids are lowercase; the artifact's are not. Only units that
// are base or linear convert without the nonlinear functions, which this table does
// not carry — a page in °P falls back to the base unit and says the units differ.
const TARGET_UNIT = {
  sg: ["gravity", "SG"],
  plato: ["gravity", "Plato"],
  pct: ["abv", "pct"],
  l: ["volume", "L"],
  gal: ["volume", "gal"],
  qt: ["volume", "qt"],
  ml: ["volume", "ml"],
  ibu: ["ibu", "IBU"],
};

export function buildDelta({ payload, ledger = [], engine, reportError = ignoreError }) {
  const grist = solvedGrist(engine, reportError);
  const hops = solvedHops(engine, reportError);
  return {
    lines: lineDeltas({ ledger, grist, hops }),
    targets: targetDeltas(payload, engine, reportError),
  };
}

// Boundary outputs are resolved, not got: `get` addresses a node, and a boundary
// output is a path through one. A boundary that did not solve yields undefined,
// which is absence rather than a zero to compare against.
function read(engine, path, reportError = ignoreError) {
  try {
    const value = engine.resolve(path);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch (err) {
    reportError("importDelta.read", err);
    return null;
  }
}

function solvedGrist(engine, reportError = ignoreError) {
  return read(engine, "solver.batch.m_grist", reportError);
}

function solvedHops(engine, reportError = ignoreError) {
  return {
    boil: rows(engine, "solver.hops.boil_rows", reportError),
    whirlpool: rows(engine, "solver.hops.whirlpool_rows", reportError),
  };
}

function rows(engine, path, reportError = ignoreError) {
  try {
    const value = engine.resolve(path);
    return Array.isArray(value) ? value : [];
  } catch (err) {
    reportError("importDelta.rows", err);
    return [];
  }
}

// The projection drops unmapped lines, so the mapped rows are the solved rows in
// the same order the collections hold them.
const MASS_DESTINATIONS = new Set([
  "grist.major_malts",
  "grist.trace_malts",
  "batch.sugars",
  "batch.boil_hops",
  "batch.whirlpool_hops",
  "batch.dry_hops",
]);

function lineDeltas({ ledger, grist, hops }) {
  const out = [];
  const mapped = ledger.filter(
    (row) => row.decision === "mapped" && row.ref && MASS_DESTINATIONS.has(row.destination)
  );
  let boilIndex = 0;
  let whirlpoolIndex = 0;

  for (const row of mapped) {
    const sourceKg = massKg(row.quantity);
    const entry = {
      line_id: row.line_id,
      label: row.name,
      destination: row.destination,
      source_kg: sourceKg,
      solved_kg: null,
      note: "",
    };
    if (row.destination === "grist.major_malts") entry.solved_kg = gristShare(row, grist);
    if (row.destination === "grist.trace_malts") entry.solved_kg = sourceKg;
    if (row.destination === "batch.boil_hops") {
      entry.solved_kg = hops.boil[boilIndex]?.mass_kg ?? null;
      boilIndex += 1;
    }
    if (row.destination === "batch.whirlpool_hops") {
      entry.solved_kg = hops.whirlpool[whirlpoolIndex]?.mass_kg ?? null;
      whirlpoolIndex += 1;
    }
    if (row.destination === "batch.dry_hops") entry.note = "authored, not solved";
    out.push(withRatio(entry));
  }
  return out;
}

// A major malt's mass is solved, not authored: the bill is proportions, and the
// mass comes from the target gravity.
function gristShare(row, total) {
  if (!(total > 0)) return null;
  const share = row.quantity?.unit === "pct" ? row.quantity.value / 100 : row.share;
  return Number.isFinite(share) ? total * share : null;
}

function withRatio(entry) {
  if (!(entry.source_kg > 0) || entry.solved_kg == null) return entry;
  return { ...entry, ratio: entry.solved_kg / entry.source_kg };
}

function targetDeltas(payload, engine, reportError = ignoreError) {
  const targets = payload?.targets ?? {};
  return [
    targetRow("Original gravity", targets.og, read(engine, "solver.batch.sg_post_boil", reportError), reportError),
    targetRow("Final gravity", targets.fg, read(engine, "batch.realized_fg", reportError), reportError),
    targetRow("ABV", targets.abv, read(engine, "batch.realized_abv", reportError), reportError),
    targetRow("Volume", targets.volume, read(engine, "batch.v_ferm", reportError), reportError),
  ].filter(Boolean);
}

// The page's number is shown as it was written; the comparison itself is in base
// units, because that is the only place two numbers can be subtracted. Display
// conversion belongs to the producer's unit mode (A8), so this table never converts
// a solved value outward — it converts the page's value inward, exactly as the
// mapping does when it writes a mass.
function targetRow(label, stated, solved, reportError = ignoreError) {
  if (!stated) return null;
  const view = displayFor(stated);
  const baseValue = statedInBase(stated.value, view, reportError);
  return {
    label,
    dimension: view?.dimension ?? null,
    unit: stated.unit,
    source: stated.value,
    solved,
    delta: solved == null ? null : solved - stated.value,
    source_display: statedText(stated, view),
    solved_display: solvedText(solved, view),
    delta_display: deltaText(baseValue, solved, view),
  };
}

function displayFor(stated) {
  const mapped = TARGET_UNIT[stated.unit];
  if (!mapped) return null;
  const [dimension, unit] = mapped;
  const baseUnit = artifact.dimensions[dimension]?.base_unit ?? unit;
  return {
    dimension,
    unit,
    baseUnit,
    baseDecimals: unitDecimals(dimension, baseUnit),
    baseSymbol: baseSymbol(dimension),
    symbol: unitSymbol(stated.unit),
    decimals: unitDecimals(dimension, unit),
  };
}

function statedText(stated, view) {
  if (!view) return String(stated.value);
  return withSymbol(formatWithDecimals(stated.value, view.decimals), view.symbol);
}

function solvedText(solved, view) {
  if (solved == null) return "—";
  if (!view) return String(solved);
  return withSymbol(formatWithDecimals(solved, view.baseDecimals), view.baseSymbol);
}

function deltaText(baseValue, solved, view) {
  if (baseValue == null || solved == null || !view) return "—";
  return signed(formatWithDecimals(solved - baseValue, view.baseDecimals), view.baseSymbol);
}

function statedInBase(value, view, reportError = ignoreError) {
  if (!view) return null;
  try {
    return toBase(artifact, view.dimension, view.unit, value);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("Nonlinear"))) {
      reportError("importDelta.statedInBase", err);
    }
    return null;
  }
}

function baseSymbol(dimension) {
  return dimension === "gravity" ? "SG" : dimension === "volume" ? "L" : dimension === "abv" ? "%" : "";
}

function withSymbol(text, symbol) {
  if (text === "") return "—";
  if (!symbol) return text;
  return symbol === "%" ? `${text}%` : `${text} ${symbol}`;
}

function signed(text, symbol) {
  if (text === "") return "—";
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return "—";
  const body = numeric === 0 ? text.replace(/^-/, "") : text;
  return withSymbol(numeric > 0 ? `+${body}` : body, symbol);
}

export function grams(kg) {
  return kg == null ? null : kg * KG_TO_G;
}
