// The delta table: what the page said, next to what this rig will actually use.
//
// This is the feature's whole claim. A magazine's masses cannot survive import —
// efficiency, malt specs, hop utilization and yeast attenuation are ours, not
// theirs — so the honest output is a per-line comparison with the reason each
// difference exists, not a number that looks like the page.
//
// Reading is pure: the engine is passed in already solved by the gate.

import { reportError } from "../observability.js";
import { massKg } from "../views/import/ledger.js";

const KG_TO_G = 1000;

export function buildDelta({ payload, ledger = [], engine }) {
  const grist = solvedGrist(engine);
  const hops = solvedHops(engine);
  return {
    lines: lineDeltas({ ledger, grist, hops }),
    targets: targetDeltas(payload, engine),
  };
}

// A boundary that did not solve leaves no value: absence, not a zero to compare
// against. The read is reported so a wiring mistake is not mistaken for a gap.
function read(engine, path) {
  try {
    const value = engine.get(path);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch (err) {
    reportError("importDelta.read", err);
    return null;
  }
}

function solvedGrist(engine) {
  return read(engine, "solver.batch.m_grist");
}

function solvedHops(engine) {
  return {
    boil: rows(engine, "solver.hops.boil_rows"),
    whirlpool: rows(engine, "solver.hops.whirlpool_rows"),
  };
}

function rows(engine, path) {
  try {
    const value = engine.get(path);
    return Array.isArray(value) ? value : [];
  } catch (err) {
    reportError("importDelta.rows", err);
    return [];
  }
}

// The projection drops unmapped lines, so the mapped rows are the solved rows in
// the same order the collections hold them.
function lineDeltas({ ledger, grist, hops }) {
  const out = [];
  const mapped = ledger.filter((row) => row.decision === "mapped" && row.ref);
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

function targetDeltas(payload, engine) {
  const targets = payload?.targets ?? {};
  return [
    targetRow("Original gravity", targets.og, read(engine, "solver.batch.sg_post_boil"), "sg"),
    targetRow("Final gravity", targets.fg, read(engine, "batch.realized_fg"), "sg"),
    targetRow("ABV", targets.abv, read(engine, "batch.realized_abv"), "pct"),
    targetRow("Volume", targets.volume, read(engine, "batch.v_ferm"), "l"),
  ].filter(Boolean);
}

function targetRow(label, stated, solved, dimension) {
  if (!stated) return null;
  return {
    label,
    source: stated.value,
    unit: stated.unit,
    solved,
    dimension,
    delta: solved == null ? null : solved - stated.value,
  };
}

export function grams(kg) {
  return kg == null ? null : kg * KG_TO_G;
}
