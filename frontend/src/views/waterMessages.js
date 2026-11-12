// One home for every user-facing water string and its derivation: statuses,
// hints, notices, the route line, the target warning and the pH disclosure.
// Cards and row builders must not invent copy; `water-messages.test.js` pins the
// vocabulary to this module.

import { formatWithDecimals } from "../utils.js";
import { WATER_IONS } from "./registry/water.js";

export const WATER_STATUS = {
  held: "Held",
  preCorrection: "Held (pre-correction)",
  heldMin: "Held (min)",
  bestFit: "Best fit",
  floated: "Floated",
  unset: "Unset",
};

export const WATER_HINTS = {
  correction: "moved by the mash-pH correction",
  noObjective: "no objective entered",
  belowSource: "below source",
};

export const NO_OBJECTIVE = "(none)";

const ION_SHORT = { ca: "Ca", mg: "Mg", na: "Na", so4: "SO₄", cl: "Cl", alk: "Alk" };
const CORRECTION_KEYS = new Set(["acid_l", "baking_soda_kg", "chalk_kg", "pickling_lime_kg"]);

function fmtPh(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatWithDecimals(value, 2)
    : null;
}

function fmtPpm(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatWithDecimals(value, 1, { dash: "—" })
    : "—";
}

export function phStatusLabel(field) {
  return field?.optionLabels?.[field?.value] ?? field?.display ?? "";
}

export function constraintLabel(held) {
  const ordered = WATER_IONS.map((row) => row.pin).filter((pin) => held.includes(pin));
  if (ordered.length === 0) return "No objectives";
  if (ordered.length === 6) return "All six";
  return ordered.map((pin) => ION_SHORT[pin]).join("/");
}

// One line under the grid: what the solver will actually do with this set.
export function routeLine(held) {
  const count = held.length;
  if (count === 0) return "No objectives — no mineral dosing; mash pH still corrected";
  if (count === 6) return "Objectives: all six — best fit, nothing held exactly";
  const suffix = count === 5 ? "exactly determined, may be infeasible" : "exact";
  return `Objectives: ${constraintLabel(held)} (${count}) — ${suffix}`;
}

export function targetWarning(held) {
  if (held.length === 5) {
    return "5 objectives — exactly determined. The solver may fail to find a feasible dose; unpin one to leave a degree of freedom.";
  }
  if (held.length === 6) {
    return "All six objectives — best fit, not exact. The solver minimises error and guarantees no individual objective.";
  }
  return "";
}

// The status names the finished water, not the solver branch. `drifted` means
// the stage-2 correction moved a value that held its equality.
export function statusFor(route, pin, drifted = false) {
  if (route === "OPTIMIZE") return WATER_STATUS.bestFit;
  if (route === "HYBRID" && pin === "alk") return WATER_STATUS.heldMin;
  return drifted ? WATER_STATUS.preCorrection : WATER_STATUS.held;
}

export function rowState({ isChecked, isValued, below, drifted, phCorrected, pin, route }) {
  if (!isChecked) {
    const hint = pin === "alk" && phCorrected ? WATER_HINTS.correction : "";
    return { status: WATER_STATUS.floated, hint };
  }
  if (!isValued) return { status: WATER_STATUS.unset, hint: WATER_HINTS.noObjective };
  return {
    status: statusFor(route, pin, drifted),
    hint: drifted ? WATER_HINTS.correction : below ? WATER_HINTS.belowSource : "",
  };
}

// The calcium minimum is inert without objectives, redundant while calcium is
// itself an objective, and contradictory when it sits above that objective.
export function floorNotice(pinnedCount, caPinned, floor, caTarget) {
  if (pinnedCount === 0) return "Not used: no ion objectives are held.";
  if (!caPinned || typeof floor !== "number" || typeof caTarget !== "number") return "";
  if (floor > caTarget) {
    return `Above the pinned calcium objective (${fmtPpm(caTarget)} ppm); the objective wins.`;
  }
  return `Not used while calcium is an objective (${fmtPpm(caTarget)} ppm).`;
}

function correctionRows(rows, destination) {
  return rows
    .filter((row) => CORRECTION_KEYS.has(row.key))
    .map((row) => `${destination} ${row.label} ${row.text}`);
}

export function phLine(uncorrectedPh, correctedPh, mashRows, spargeRows) {
  const before = fmtPh(uncorrectedPh);
  const after = fmtPh(correctedPh);
  if (before == null || after == null) return "—";
  const corrections = [
    ...correctionRows(mashRows, "grist"),
    ...correctionRows(spargeRows, "HLT"),
  ];
  const suffix = corrections.length > 0 ? ` · ${corrections.join(" · ")}` : " · no correction";
  return `${before} → ${after}${suffix}`;
}
