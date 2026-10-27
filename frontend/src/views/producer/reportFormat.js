// Freeze-time display strings for the report bundle. This is the only place a
// report value is converted, rounded, or given a unit symbol: it uses the same
// producer formatting as the UI and the catalog's unit-aware presentation, so
// the Typst generator never does conversion math.

import { resolveReference } from "../../engine/paths.js";
import { displayValue, nonlinearFns } from "../producer.js";
import { formatValue } from "../../utils.js";
import { reportError } from "../../observability.js";
import { FERMENTABLE_NODES as N } from "../registry/fermentables.js";

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
  const number =
    entry.decimals != null && typeof shown === "number"
      ? shown.toFixed(entry.decimals)
      : formatValue(shown);
  const symbol = entry.symbol ?? null;
  return symbol
    ? {
        text: symbol === "%" ? `${number}${symbol}` : `${number} ${symbol}`,
        number,
        unit: symbol,
      }
    : { text: number, number };
}

function formatPpg(artifact, yieldFraction) {
  if (typeof yieldFraction !== "number" || !Number.isFinite(yieldFraction)) {
    return { text: "—" };
  }
  const factor =
    (artifact.constants?.sucrose_yield_ldk?.value ?? 0) /
    (artifact.dimensions?.extract_yield?.units?.gal_deg_per_lb?.factor ?? 1);
  const number = (yieldFraction * factor).toFixed(1);
  return { text: number, number };
}

function rowName(row) {
  return { text: String(row?.name ?? "") };
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

// Per-row display strings for the grist tables. Major amounts are the solved
// grist mass times the authored bill share; trace amounts are authored masses.
// Trace bill shares are mass shares of the total fermentable mass (major +
// trace) because trace rows have no authored bill percentage.
export function buildReportTables(artifact, catalog, engine) {
  const nl = nonlinearFns(artifact, engine);
  const nodes = catalog.nodes ?? {};
  const majorId = N.majorMalts;
  const traceId = N.traceMalts;
  const gristMassPath = N.gristMass;
  const majorColor = `${majorId}.color_lovibond`;
  const majorPct = `${majorId}.pct`;
  const traceMass = `${traceId}.mass_kg`;
  const traceColor = `${traceId}.color_lovibond`;
  const mGrist = engine.resolve(gristMassPath);
  const gristMass = typeof mGrist === "number" && Number.isFinite(mGrist) ? mGrist : null;

  const major = engine.get(majorId) ?? [];
  const majorRows = major.map((row) => {
    const pct = Number(row.pct) || 0;
    const amount = gristMass == null ? null : gristMass * pct;
    return {
      name: rowName(row),
      amount: formatEntry(artifact, nodes[gristMassPath], amount, nl),
      ppg: formatPpg(artifact, Number(row.yield_fraction)),
      color: formatEntry(artifact, nodes[majorColor], Number(row.color_lovibond), nl),
      bill_pct: formatEntry(artifact, nodes[majorPct], pct, nl),
    };
  });

  const trace = engine.get(traceId) ?? [];
  const traceTotalMass = trace.reduce((sum, row) => sum + (Number(row.mass_kg) || 0), 0);
  const totalMass = (gristMass ?? 0) + traceTotalMass;
  const traceRows = trace.map((row) => {
    const mass = Number(row.mass_kg) || 0;
    const share = totalMass > 0 ? mass / totalMass : 0;
    return {
      name: rowName(row),
      amount: formatEntry(artifact, nodes[traceMass], mass, nl),
      ppg: formatPpg(artifact, Number(row.yield_fraction)),
      color: formatEntry(artifact, nodes[traceColor], Number(row.color_lovibond), nl),
      bill_pct: formatEntry(artifact, nodes[majorPct], share, nl),
    };
  });

  return {
    [majorId]: majorRows,
    [traceId]: traceRows,
  };
}
