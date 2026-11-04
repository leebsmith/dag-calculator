// The ledger: every transcribed line, and the one decision it still needs.
//
// A third-party recipe does not split its grain bill, hops or mash the way this
// calculator does, and the split is physics, not tidiness: trace malts are mass
// that is never scaled by the solve, boil and whirlpool hops draw from different
// IBU pools. So the ledger proposes destinations from what the page printed, and
// a person confirms them. Nothing here writes engine state; this is the mapping
// the record stores and the commit later plays back through the real builders.

import artifact from "../../engine/artifact.json" with { type: "json" };
import { toBase } from "../../engine/units.js";
import { proposeRest } from "./candidates.js";
import { normalizedRowShares } from "../producer/authoring.js";

export const TRACE_THRESHOLD_PCT = 2;

const MALT_KINDS = new Set(["malt", "adjunct", "unknown"]);

export const DESTINATIONS = [
  {
    id: "grist.major_malts",
    section: "fermentables",
    label: "Grain bill",
    catalog: "malt",
    transform: "mass→parts",
  },
  {
    id: "grist.trace_malts",
    section: "fermentables",
    label: "Trace malt",
    catalog: "malt",
    transform: "mass→mass",
  },
  {
    id: "batch.sugars",
    section: "fermentables",
    label: "Sugar",
    catalog: "sugar",
    transform: "mass→parts",
  },
  {
    id: "batch.boil_hops",
    section: "hops",
    label: "Boil",
    catalog: "hop",
    transform: "minutes→fraction",
  },
  {
    id: "batch.whirlpool_hops",
    section: "hops",
    label: "Whirlpool",
    catalog: "hop",
    transform: "stage→whirlpool",
  },
  {
    id: "batch.dry_hops",
    section: "hops",
    label: "Dry hop",
    catalog: "hop",
    transform: "quantity→quantity",
  },
  { id: "batch.yeast", section: "yeasts", label: "Yeast", catalog: "yeast", transform: "selection" },
  { id: "mash.rests", section: "mashes", label: "Mash rest", catalog: null, transform: "step→rest" },
  { id: "none", section: "unmodeled", label: "Not modelled", catalog: null, transform: "none" },
];

// The model's own vocabulary for a mash step. Not a catalog: there are eight
// rests, each with a temperature range, so the proposal is arithmetic.
export const DESTINATION_BY_ID = Object.fromEntries(DESTINATIONS.map((entry) => [entry.id, entry]));

export function destinationOf(id) {
  return DESTINATION_BY_ID[id] ?? null;
}

export function destinationsFor(section) {
  return DESTINATIONS.filter((entry) => entry.section === section);
}

// -----------------------------------------------------------------------------
// Building the ledger
// -----------------------------------------------------------------------------

export function buildLedger(payload, { traceThresholdPct = TRACE_THRESHOLD_PCT } = {}) {
  const rows = [
    ...rowsOf(payload, "fermentables", fermentableRow),
    ...rowsOf(payload, "hops", hopRow),
    ...rowsOf(payload, "yeasts", yeastRow),
    ...rowsOf(payload, "mashes", mashRow),
    ...rowsOf(payload, "unmodeled", unmodeledRow),
  ];
  return assignShareProposals(rows, traceThresholdPct);
}

function rowsOf(payload, key, build) {
  return (payload?.[key] ?? []).map(build);
}

function baseRow(section, index, line, extra) {
  return {
    line_id: `${section}[${index}]`,
    section,
    text: line.verbatim ?? line.step_verbatim ?? line.text ?? line.name ?? "",
    page: line.page ?? null,
    name: line.name ?? line.step_verbatim ?? line.text ?? "",
    quantity: line.quantity ?? null,
    destination: null,
    ref: null,
    decision: "unresolved",
    reason: "",
    ...extra,
  };
}

function fermentableRow(line, index) {
  return baseRow("fermentables", index, line, {
    kind_hint: line.kind_hint ?? "unknown",
    transform: "mass→parts",
  });
}

function hopRow(line, index) {
  return baseRow("hops", index, line, {
    stage_guess: line.stage_guess ?? "unknown",
    minutes: line.minutes ?? null,
    alpha_acid_pct: line.alpha_acid_pct ?? null,
    ibu_contribution: line.ibu_contribution ?? null,
    transform: "minutes→fraction",
  });
}

function yeastRow(line, index) {
  return baseRow("yeasts", index, line, {
    lab: line.lab ?? "",
    code: line.code ?? "",
    transform: "selection",
  });
}

function mashRow(line, index) {
  return baseRow("mashes", index, line, {
    temperature: line.temperature ?? null,
    duration_min: line.duration_min ?? null,
    transform: "step→rest",
  });
}

function unmodeledRow(line, index) {
  return baseRow("unmodeled", index, line, {
    kind: line.kind ?? "other",
    destination: "none",
    decision: "ignored",
    reason: "outside the model",
  });
}

// -----------------------------------------------------------------------------
// Proposals the page supports
// -----------------------------------------------------------------------------

function assignShareProposals(rows, traceThresholdPct) {
  const fermentables = rows.filter((row) => row.section === "fermentables");
  const masses = fermentables.map((row) => ({ row, kg: massKg(row.quantity) }));
  const total = masses.reduce((sum, entry) => sum + (entry.kg ?? 0), 0);
  const threshold = traceThresholdPct / 100;

  for (const { row, kg } of masses) {
    row.mass_kg = kg;
    row.share = shareOf(row, kg, total);
    if (row.destination) continue;
    row.destination = fermentableDestination(row, row.share, threshold);
  }
  return rows.map((row) => proposeDestination(row));
}

function shareOf(row, kg, total) {
  if (row.quantity?.unit === "pct") return row.quantity.value / 100;
  if (kg !== null && total > 0) return kg / total;
  return null;
}

function fermentableDestination(row, share, threshold) {
  if (row.kind_hint === "sugar" || row.kind_hint === "extract") return "batch.sugars";
  if (share !== null && share < threshold) return "grist.trace_malts";
  if (MALT_KINDS.has(row.kind_hint)) return "grist.major_malts";
  return null;
}

// A mash step is proposed from its own temperature, and marked proposed so the
// row reads as a default rather than a decision.
function proposeDestination(row) {
  if (row.section === "hops") return withHopDestination(row);
  if (row.section !== "mashes") return row;
  const rest = proposeRest(row);
  if (!rest) return row;
  return {
    ...row,
    destination: "mash.rests",
    ref: rest.rest_id,
    transform: DESTINATION_BY_ID["mash.rests"].transform,
    decision: "mapped",
    proposed: true,
  };
}

function withHopDestination(row) {
  const byStage = {
    boil: "batch.boil_hops",
    whirlpool: "batch.whirlpool_hops",
    dry_hop: "batch.dry_hops",
  };
  row.destination = byStage[row.stage_guess] ?? null;
  return row;
}

// -----------------------------------------------------------------------------
// Decisions
// -----------------------------------------------------------------------------

export function applyRef(row, item, catalogKind) {
  if (!item) return row;
  const destination = keepOrSwitch(row, itemDestination(catalogKind));
  return {
    ...row,
    ref: item.id ?? null,
    destination,
    transform: destination ? DESTINATION_BY_ID[destination].transform : row.transform,
    decision: destination ? "mapped" : "unresolved",
    reason: "",
    proposed: false,
  };
}

// Picking a hop must not drag a whirlpool charge into the boil: a destination is
// kept when it already belongs to the picked catalog, and only replaced when the
// pick changes family (a sugar chosen on a malt line, say).
function keepOrSwitch(row, implied) {
  const current = DESTINATION_BY_ID[row.destination];
  const target = DESTINATION_BY_ID[implied];
  if (current && target && current.catalog === target.catalog) return row.destination;
  return implied ?? row.destination;
}

function itemDestination(kind) {
  return {
    malt: "grist.major_malts",
    sugar: "batch.sugars",
    hop: "batch.boil_hops",
    yeast: "batch.yeast",
    mash: "mash.rests",
  }[kind] ?? null;
}

export function setDestination(row, destination) {
  const entry = DESTINATION_BY_ID[destination];
  if (!entry) return row;
  return {
    ...row,
    destination,
    transform: entry.transform,
    decision: destination === "none" ? "ignored" : row.ref ? "mapped" : "unresolved",
    reason: destination === "none" ? row.reason || "not modelled" : "",
  };
}

export function ignoreRow(row, reason) {
  return { ...row, destination: "none", decision: "ignored", reason: reason || "not modelled" };
}

// Ignoring is a decision, not a deletion: restoring re-derives the destination the
// page's own evidence supports and leaves the row unresolved until a ref is chosen.
// A blend's second strain comes back this way when the blend record exists.
export function restoreRow(row, { traceThresholdPct = TRACE_THRESHOLD_PCT } = {}) {
  const reopened = { ...row, decision: "unresolved", reason: "" };
  const destination =
    row.section === "fermentables"
      ? fermentableDestination(row, row.share ?? null, traceThresholdPct / 100)
      : row.section === "yeasts"
        ? "batch.yeast"
        : null;
  return proposeDestination({
    ...reopened,
    destination,
    transform: destination ? DESTINATION_BY_ID[destination].transform : row.transform,
  });
}

export function destinationLabel(row) {
  if (!row) return "";
  if (row.decision === "ignored" || row.destination === "none") return "Not modelled";
  const current = DESTINATION_BY_ID[row.destination];
  if (current) return current.label;
  const only = destinationsFor(row.section);
  return only.length === 1 ? only[0].label : "—";
}

export function isResolved(row) {
  if (row.decision === "ignored") return Boolean(row.reason?.trim());
  return row.decision === "mapped" && Boolean(row.ref);
}

// -----------------------------------------------------------------------------
// Readouts
// -----------------------------------------------------------------------------

export function ledgerCounts(ledger = []) {
  const counts = { total: ledger.length, mapped: 0, ignored: 0, unresolved: 0, bySection: {} };
  for (const row of ledger) {
    if (isResolved(row)) counts[row.decision] += 1;
    else counts.unresolved += 1;
    const section = (counts.bySection[row.section] ??= { total: 0, resolved: 0 });
    section.total += 1;
    if (isResolved(row)) section.resolved += 1;
  }
  return counts;
}

export function unresolvedRows(ledger = []) {
  return ledger.filter((row) => !isResolved(row));
}

// -----------------------------------------------------------------------------
// Shares: what the ledger would put in each collection
// -----------------------------------------------------------------------------

const PART_COLLECTIONS = [
  "grist.major_malts",
  "batch.sugars",
  "batch.boil_hops",
  "batch.whirlpool_hops",
];

export function shares(ledger = []) {
  const out = {};
  for (const collection of PART_COLLECTIONS) {
    const rows = ledger
      .filter((row) => row.destination === collection && row.decision === "mapped")
      .map((row) => ({ line_id: row.line_id, ref: row.ref, parts: partOf(row) }))
      .filter((row) => row.parts > 0);
    out[collection] = normalizedRowShares(rows);
  }
  return out;
}

function partOf(row) {
  if (row.quantity?.unit === "pct") return row.quantity.value;
  return massKg(row.quantity) ?? 0;
}

export function massKg(quantity) {
  if (!quantity) return null;
  if (quantity.unit === "pct") return null;
  if (!["g", "kg", "oz", "lb"].includes(quantity.unit)) return null;
  return toBase(artifact, "mass", quantity.unit, quantity.value);
}

export function gravityPointsToSg(target) {
  if (!target) return null;
  if (target.unit === "points") return target.value / 1000;
  if (target.unit === "sg" || target.unit == null) return target.value;
  return null;
}

// -----------------------------------------------------------------------------
// Candidate screening (L1): rank, never exclude
// -----------------------------------------------------------------------------

export { proposeRest, restCandidates, screenCandidates } from "./candidates.js";
