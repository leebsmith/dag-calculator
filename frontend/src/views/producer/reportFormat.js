// Freeze-time display strings for the report bundle. This is the only place a
// report value is converted, rounded, or given a unit symbol: it uses the same
// producer formatting as the UI and the catalog's unit-aware presentation, so
// the Typst generator never does conversion math.

import { resolveReference } from "../../engine/paths.js";
import { displayValue, nonlinearFns } from "../producer.js";
import { reportError } from "../../observability.js";
import { hamiltonPct } from "../hamilton.js";
import { FERMENTABLE_NODES as N } from "../registry/fermentables.js";
import { LATE_ADDITION_NODES as L } from "../registry/late-additions.js";
import { resolvedSugarMasses } from "./sugarAllocation.js";
import { cellLabel, formatCell } from "./cell.js";

// Collection fields are row values, not scalars: the catalog lists them for a
// report that indexes a row, but there is no single value to format.
function isCollectionField(artifact, path) {
  const ref = resolveReference(artifact, path);
  if (!ref || ref.kind !== "node" || ref.suffix.length === 0) return false;
  return artifact.nodes?.[ref.nodeId]?.kind === "collection";
}

function formatEntry(artifact, entry, value, nl) {
  if (!entry || value === null || value === undefined) return { text: "—" };
  if (typeof value !== "number") return { text: String(value) };
  const shown = displayValue(artifact, entry.dimension, entry.unit, value, nl);
  const cell = formatCell(shown, { decimals: entry.decimals });
  return entry.symbol
    ? {
        text: cellLabel(cell.display, { symbol: entry.symbol }),
        number: cell.display,
        unit: entry.symbol,
      }
    : { text: cell.display, number: cell.display };
}

function formatPpg(artifact, yieldFraction) {
  if (typeof yieldFraction !== "number" || !Number.isFinite(yieldFraction)) {
    return { text: "—" };
  }
  const factor =
    (artifact.constants?.sucrose_yield_ldk?.value ?? 0) /
    (artifact.dimensions?.extract_yield?.units?.gal_deg_per_lb?.factor ?? 1);
  const number = formatCell(yieldFraction * factor, { decimals: 1 }).display;
  return { text: number, number };
}

function rowName(row) {
  return { text: String(row?.name ?? "") };
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildReportFormatted(artifact, catalog, engine) {
  const nl = nonlinearFns(artifact, engine);
  const formatted = {};
  for (const [path, entry] of Object.entries(catalog.nodes ?? {})) {
    if (isCollectionField(artifact, path)) continue;
    let value;
    try {
      value = engine.resolve(path);
    } catch (err) {
      reportError("reportFormatted.value", err);
      continue;
    }
    if (value === null || value === undefined) continue;

    if (typeof value === "number") {
      formatted[path] = formatEntry(artifact, entry, value, nl);
      continue;
    }

    if (typeof value === "string") {
      const text = entry.option_labels?.[value] ?? value;
      if (text !== "") formatted[path] = { text };
      continue;
    }

    if (typeof value === "boolean") formatted[path] = { text: String(value) };
  }
  return formatted;
}

// The solved grist mass, or null when the batch has no extract solution yet.
function gristMassOf(engine) {
  try {
    const mass = engine.resolve(N.gristMass);
    return typeof mass === "number" && Number.isFinite(mass) ? mass : null;
  } catch (err) {
    reportError("reportTables.gristMass", err);
    return null;
  }
}

// The operative mass of every fermentable row. Major amounts are the solved
// grist mass times the authored bill share; trace amounts are authored masses;
// sugar amounts come from the same allocator the late-additions table binds, so
// share mode reports the mass the UI shows.
function fermentableRows(engine, gristMass) {
  const major = (engine.get(N.majorMalts) ?? []).map((row) => {
    const mass = gristMass == null ? 0 : gristMass * finiteNumber(row.pct);
    const yieldFraction = finiteNumber(row.yield_fraction);
    return {
      row,
      mass,
      color: finiteNumber(row.color_lovibond),
      yield: yieldFraction,
      // Potential extract: dry-basis yield net of the malt's moisture.
      extract: mass * yieldFraction * (1 - finiteNumber(row.moisture_fraction)),
    };
  });
  const trace = (engine.get(N.traceMalts) ?? []).map((row) => ({
    row,
    mass: finiteNumber(row.mass_kg),
    color: finiteNumber(row.color_lovibond),
    yield: finiteNumber(row.yield_fraction),
    extract: 0,
  }));
  const sugarRaw = engine.get(L.collection) ?? [];
  const mode = engine.get(L.intent) ?? "dose";
  let budget = 0;
  try {
    const resolvedBudget = engine.resolve(L.extract);
    if (typeof resolvedBudget === "number" && Number.isFinite(resolvedBudget)) {
      budget = resolvedBudget;
    }
  } catch (err) {
    reportError("reportTables.sugarExtract", err);
  }
  const resolved = resolvedSugarMasses({
    rows: sugarRaw,
    budgetKg: budget,
    mode,
  });
  const sugar = sugarRaw.map((row, index) => ({
    row,
    mass: finiteNumber(resolved[index]?.massKg),
    color: finiteNumber(row.color_lovibond),
    yield: finiteNumber(row.yield_fraction),
    extract: finiteNumber(resolved[index]?.massKg) * finiteNumber(row.yield_fraction),
  }));
  return { major, trace, sugar };
}

// Per-row display strings for the fermentable tables. Grist is the malt charge
// (major + trace); sugars are measured against it, so the three tables' shares
// do not partition to 100. `own_pct` is the row's share of its own table (the
// authored grain bill for major malts, the mass share for trace malts), and
// `grist_pct` is its share of the whole grist. Both are largest-remainder
// normalised so each column sums to exactly 100.0.
export function buildReportTables(artifact, catalog, engine) {
  const nl = nonlinearFns(artifact, engine);
  const nodes = catalog.nodes ?? {};
  const majorId = N.majorMalts;
  const traceId = N.traceMalts;
  const sugarId = L.collection;
  const gristMassPath = N.gristMass;
  const majorColor = `${majorId}.color_lovibond`;
  const majorPct = `${majorId}.pct`;
  const traceMass = `${traceId}.mass_kg`;
  const traceColor = `${traceId}.color_lovibond`;
  const sugarMass = `${sugarId}.mass_kg`;
  const sugarColor = `${sugarId}.color_lovibond`;

  const gristMass = gristMassOf(engine);
  const { major, trace, sugar } = fermentableRows(engine, gristMass);
  const gristRows = [...major, ...trace];
  const gristTotal = gristRows.reduce((sum, row) => sum + row.mass, 0);
  const gristShares = hamiltonPct(gristRows.map((row) => row.mass));
  const traceShares = hamiltonPct(trace.map((row) => row.mass));
  const extractRows = [...major, ...sugar];
  const extractShares = hamiltonPct(extractRows.map((row) => row.extract));

  const pctCell = (fraction) =>
    fraction == null
      ? { text: "—" }
      : formatEntry(artifact, nodes[majorPct], fraction, nl);

  const tableRow = (row, amountPath, colorPath, ownPct, gristPct) => ({
    name: rowName(row.row),
    amount: formatEntry(artifact, nodes[amountPath], row.mass, nl),
    ppg: formatPpg(artifact, row.row.yield_fraction),
    color: formatEntry(artifact, nodes[colorPath], row.color, nl),
    own_pct: pctCell(ownPct),
    grist_pct: pctCell(gristPct),
  });

  const majorRows = major.map((row, index) => ({
    name: rowName(row.row),
    amount: formatEntry(artifact, nodes[gristMassPath], row.mass, nl),
    ppg: formatPpg(artifact, row.row.yield_fraction),
    color: formatEntry(artifact, nodes[majorColor], row.color, nl),
    own_pct: pctCell(finiteNumber(row.row.pct)),
    grist_pct: pctCell(gristShares[index]),
    extract: formatEntry(artifact, nodes[gristMassPath], row.extract, nl),
    extract_pct: pctCell(extractShares[index]),
  }));

  const traceRows = trace.map((row, index) =>
    tableRow(
      row,
      traceMass,
      traceColor,
      traceShares[index],
      gristShares[major.length + index]
    )
  );

  const sugarRows = sugar.map((row, index) => ({
    name: rowName(row.row),
    amount: formatEntry(artifact, nodes[sugarMass], row.mass, nl),
    ppg: formatPpg(artifact, row.row.yield_fraction),
    color: formatEntry(artifact, nodes[sugarColor], row.color, nl),
    grist_pct: pctCell(gristTotal > 0 ? row.mass / gristTotal : null),
    extract: formatEntry(artifact, nodes[sugarMass], row.extract, nl),
    extract_pct: pctCell(extractShares[major.length + index]),
  }));

  return {
    [majorId]: majorRows,
    [traceId]: traceRows,
    [sugarId]: sugarRows,
  };
}

// Mass-weighted colour and extract yield per table, plus the overall aggregate.
// Colour weighs every fermentable; extract yield covers the grain bill and the
// sugars because trace malts are colour- and mash-pH-only (A9).
export function buildReportSummaries(artifact, catalog, engine) {
  const nl = nonlinearFns(artifact, engine);
  const nodes = catalog.nodes ?? {};
  const gristMass = gristMassOf(engine);
  const { major, trace, sugar } = fermentableRows(engine, gristMass);

  const weigh = (rows) => {
    const mass = rows.reduce((sum, row) => sum + row.mass, 0);
    if (!(mass > 0)) return { mass: 0, color: null, extractYield: null };
    const color = rows.reduce((sum, row) => sum + row.color * row.mass, 0) / mass;
    const extract = rows.reduce((sum, row) => sum + row.yield * row.mass, 0) / mass;
    return { mass, color, extractYield: extract };
  };

  const summaryOf = (color, extractYield, colorPath, yieldPath) => ({
    color: color == null ? null : formatEntry(artifact, nodes[colorPath], color, nl),
    extract_yield:
      extractYield == null
        ? null
        : formatEntry(artifact, nodes[yieldPath], extractYield, nl),
  });

  const majorValues = weigh(major);
  const traceValues = weigh(trace);
  const sugarValues = weigh(sugar);
  const overallColor = weigh([...major, ...trace, ...sugar]);
  const overallYield = weigh([...major, ...sugar]);

  const summaries = {
    [N.majorMalts]: summaryOf(
      majorValues.color,
      majorValues.extractYield,
      N.weightedLovibond,
      N.weightedYield
    ),
    [N.traceMalts]: summaryOf(
      traceValues.color,
      traceValues.extractYield,
      N.traceColor,
      `${N.traceMalts}.yield_fraction`
    ),
    [L.collection]: summaryOf(
      sugarValues.color,
      sugarValues.extractYield,
      L.color,
      `${L.collection}.yield_fraction`
    ),
  };
  if (overallColor.mass > 0) {
    summaries.overall = summaryOf(
      overallColor.color,
      overallYield.extractYield,
      N.weightedLovibond,
      N.weightedYield
    );
  }
  return summaries;
}
