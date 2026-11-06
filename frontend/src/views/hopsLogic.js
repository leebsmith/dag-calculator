// Pure hop-card logic: display formatters, row merges, catalog readouts, mass
// and draft totals, and the policy descriptor builders. Everything here maps
// over plain rows, records, and callback inputs; the card adapter owns engine
// reads, reactive state, and mutations.

import { displayValue, nonlinearFns } from "./producer.js";
import { UNIT_SYMBOLS, unitDecimals } from "./registry/units.js";
import {
  countLabel,
  formatPercent,
  formatValueWithUnit,
  formatWithDecimals,
  isFiniteNumber,
  resultCounter,
  unitSymbol,
} from "../utils.js";
import {
  hopAlphaIsOutsideStock,
  hopAlphaStockLabel,
  hopDemandLine,
  hopStockRecord,
  mergeBoilRows,
  mergeWhirlpoolRows,
} from "./producer/hopRows.js";
import { doseWarning } from "./producer/boilPolicy.js";
import { startBandHint, startBandValue, startBands } from "./producer/whirlpoolPolicy.js";

export const HOP_MASS_UNITS = ["oz", "g", "lb", "kg"];
export const HOP_MASS_KEY = "hop.mass";
export const MAX_VISIBLE = 30;

const L_PER_GAL = 3.785411784;

/**
 * Create the hop card's mass and temperature formatters.
 * @pure
 * @param {{ readonly artifact: object, readonly engine: object, readonly ui: Readonly<{ readonly unitMode: Readonly<Record<string, string>> }> }} args
 */
export function createHopFormatters({ artifact, engine, ui }) {
  const formatMass = (kg, unit) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    return formatValueWithUnit(
      formatWithDecimals(value, unitDecimals("mass", unit)),
      unitSymbol(UNIT_SYMBOLS, "mass", unit),
      { dash: "—" }
    );
  };

  const formatTemp = (tempC) => {
    if (typeof tempC !== "number" || !Number.isFinite(tempC)) return "—";
    const unitId = ui.unitMode.temperature ?? "degC";
    const value = displayValue(
      artifact,
      "temperature",
      unitId,
      tempC,
      nonlinearFns(artifact, engine)
    );
    return formatValueWithUnit(
      formatWithDecimals(value, unitDecimals("temperature", unitId)),
      unitSymbol(UNIT_SYMBOLS, "temperature", unitId),
      { dash: "—" }
    );
  };

  return { formatMass, formatTemp };
}

/**
 * Format a hop row's mass in the selected unit.
 * @pure
 * @param {Readonly<{ readonly mass_kg?: number|null }>|null} row
 * @param {string} unit
 * @param {(kg: number|null, unit: string) => string} formatMass
 */
export function hopMassText(row, unit, formatMass) {
  return formatMass(row?.mass_kg, unit);
}

/**
 * Format a hop row's initial temperature.
 * @pure
 * @param {Readonly<{ readonly initial_temp_c?: number|null }>|null} row
 * @param {(tempC: number|null) => string} formatTemp
 */
export function hopTempText(row, formatTemp) {
  return formatTemp(row?.initial_temp_c);
}

/**
 * Format a row's catalogue alpha band.
 * @pure
 * @param {object} cache
 * @param {Readonly<{ readonly hop_id?: string }>|null} row
 */
export function hopAlphaRangeText(cache, row) {
  return hopAlphaStockLabel(hopStockRecord(cache, row?.hop_id));
}

/**
 * Test whether a row's alpha sits outside its catalogue band.
 * @pure
 * @param {object} cache
 * @param {Readonly<{ readonly hop_id?: string, readonly alpha_acid_pct?: number }>|null} row
 */
export function hopAlphaOutsideStockFor(cache, row) {
  return hopAlphaIsOutsideStock(row, hopStockRecord(cache, row?.hop_id));
}

/**
 * Merge the boil boundary results into the authored rows.
 * @pure
 * @param {{ readonly rows: ReadonlyArray<object>|null, readonly results: ReadonlyArray<object>|null, readonly boilIbu: number, readonly boilTimeMin: number }} args
 */
export function boilRowsFor({ rows, results, boilIbu, boilTimeMin }) {
  return mergeBoilRows(rows, results, boilIbu, boilTimeMin);
}

/**
 * Merge the whirlpool boundary results into the authored rows.
 * @pure
 * @param {{ readonly rows: ReadonlyArray<object>|null, readonly results: ReadonlyArray<object>|null, readonly whirlpoolIbu: number, readonly volume: number|null }} args
 */
export function whirlpoolRowsFor({ rows, results, whirlpoolIbu, volume }) {
  return mergeWhirlpoolRows(rows, results, whirlpoolIbu, volume);
}

/**
 * Sum the draft rows' parts.
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly parts?: number|string }>>|null} rows
 */
export function draftPartsTotal(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
}

/**
 * Summarize a draft's addition count and parts.
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly parts?: number|string }>>|null} rows
 */
export function draftSummary(rows) {
  const list = rows ?? [];
  return `${countLabel(list.length, "addition")} · ${formatWithDecimals(
    draftPartsTotal(list),
    1
  )} parts`;
}

/**
 * Build the catalogue result counter sentence.
 * @pure
 * @param {{ readonly visible: number, readonly filtered: number, readonly truncated: boolean }} args
 */
export function catalogResultLabel({ visible, filtered, truncated }) {
  return resultCounter({
    shown: visible,
    total: filtered,
    noun: "hop",
    truncated,
    truncatedHint: "refine search or purpose filters",
  });
}

/**
 * Sum the hop mass, preferring the boundary's total.
 * @pure
 * @param {ReadonlyArray<Readonly<{ readonly mass_kg?: number|null }>>|null} rows
 * @param {number|null} boundaryMassKg
 */
export function massTotalKg(rows, boundaryMassKg) {
  if (isFiniteNumber(boundaryMassKg)) return boundaryMassKg;
  return (rows ?? []).reduce(
    (sum, row) => (isFiniteNumber(row?.mass_kg) ? sum + row.mass_kg : sum),
    0
  );
}

/**
 * Format a hop mass total, preferring the boundary's value.
 * @pure
 * @param {{ readonly rows: ReadonlyArray<Readonly<{ readonly mass_kg?: number|null }>>|null, readonly boundaryMassKg: number|null, readonly unit: string, readonly formatMass: (kg: number|null, unit: string) => string }} args
 */
export function massTotalDisplay({ rows, boundaryMassKg, unit, formatMass }) {
  if (isFiniteNumber(boundaryMassKg)) return formatMass(boundaryMassKg, unit);
  const masses = (rows ?? [])
    .map((row) => row?.mass_kg)
    .filter((mass) => isFiniteNumber(mass));
  if (!masses.length) return "—";
  return formatMass(
    masses.reduce((sum, mass) => sum + mass, 0),
    unit
  );
}

/**
 * Format the combined boil and whirlpool mass.
 * @pure
 * @param {{ readonly boilRows: ReadonlyArray<object>|null, readonly whirlpoolRows: ReadonlyArray<object>|null, readonly boundaryMassKg: number|null, readonly unit: string, readonly formatMass: (kg: number|null, unit: string) => string }} args
 */
export function combinedMassDisplay({ boilRows, whirlpoolRows, boundaryMassKg, unit, formatMass }) {
  const rows = [...(boilRows ?? []), ...(whirlpoolRows ?? [])];
  if (!rows.length) return "—";
  return massTotalDisplay({ rows, boundaryMassKg, unit, formatMass });
}

/**
 * Select the catalogue entries for a hop form.
 * @pure
 * @param {object} cache
 * @param {string} form
 */
export function hopCatalogEntries(cache, form) {
  if (form === "t90_pellet" || form === "whole_cone") {
    return Object.values(cache?.seeds?.hops ?? {});
  }
  return Object.values(cache?.seeds?.hopProducts ?? {}).filter(
    (item) => item.product_form === form
  );
}

/**
 * Build the catalogue row's secondary metadata.
 * @pure
 * @param {Readonly<{ readonly product_form?: string, readonly brand?: string, readonly purpose?: string, readonly alpha_acid_pct?: number, readonly manufacturer?: string, readonly origin?: string }>} item
 */
export function hopCatalogItemMeta(item) {
  return [
    item.product_form ? item.brand ?? "Product" : item.purpose || "Hop",
    isFiniteNumber(item.alpha_acid_pct)
      ? `${formatPercent(item.alpha_acid_pct)} alpha`
      : "alpha n/a",
    item.product_form ? item.manufacturer : item.origin,
  ];
}

/**
 * Build the boil policy descriptor map.
 * @pure
 * @param {{ readonly formatMass: (kg: number|null, unit: string) => string, readonly formatNumber: (value: number|null, decimals: number) => string, readonly postBoilVolume: () => number|null, readonly boilIbu: () => number, readonly rows: () => ReadonlyArray<object>, readonly alphaMassKg: () => number|null }} args
 */
export function boilPolicyDescriptors({
  formatMass,
  formatNumber,
  postBoilVolume,
  boilIbu,
  rows,
  alphaMassKg,
}) {
  const doseOf = (row) => {
    const volume = postBoilVolume();
    if (!isFiniteNumber(row.mass_kg) || !(volume > 0)) return null;
    return (row.mass_kg * 1000) / (volume / L_PER_GAL);
  };
  return {
    hopDoseWarning: {
      configurable: true,
      get() {
        return doseWarning(rows(), formatNumber, doseOf);
      },
    },
    hopDemandLine: {
      configurable: true,
      get() {
        return hopDemandLine({
          ibu: boilIbu(),
          alphaMassKg: alphaMassKg(),
          volumeL: postBoilVolume(),
          formatMass,
          formatNumber,
        });
      },
    },
  };
}

/**
 * Build the whirlpool policy descriptor map.
 * @pure
 * @param {{ readonly notes: Readonly<Record<string, object>>, readonly formatTemp: (tempC: number|null) => string, readonly formatMass: (kg: number|null, unit: string) => string, readonly formatNumber: (value: number|null, decimals: number) => string, readonly postBoilVolume: () => number|null, readonly whirlpoolIbu: () => number, readonly activeRow: () => Readonly<{ readonly initial_temp_c?: number }>|null, readonly alphaMassKg: () => number|null }} args
 */
export function whirlpoolPolicyDescriptors({
  notes,
  formatTemp,
  formatMass,
  formatNumber,
  postBoilVolume,
  whirlpoolIbu,
  activeRow,
  alphaMassKg,
}) {
  const bands = () => startBands(notes, formatTemp);
  const bandValue = () => startBandValue(activeRow()?.initial_temp_c, bands());
  return {
    whirlpoolStartBands: {
      configurable: true,
      get() {
        return bands();
      },
    },
    whirlpoolStartBandValue: {
      configurable: true,
      get() {
        return bandValue();
      },
    },
    whirlpoolStartBandHint: {
      configurable: true,
      get() {
        return startBandHint(bandValue(), bands());
      },
    },
    whirlpoolCeilingMinute: {
      configurable: true,
      writable: true,
      value(row) {
        return formatNumber(row?.minute, 0);
      },
    },
    whirlpoolCeilingTemp: {
      configurable: true,
      writable: true,
      value(row) {
        return formatTemp(row?.tempC);
      },
    },
    whirlpoolHopDemandLine: {
      configurable: true,
      get() {
        return hopDemandLine({
          ibu: whirlpoolIbu(),
          alphaMassKg: alphaMassKg(),
          volumeL: postBoilVolume(),
          formatMass,
          formatNumber,
        });
      },
    },
  };
}

/**
 * Build the whirlpool timeline descriptor map.
 * @pure
 * @param {{ readonly formatTemp: (tempC: number|null) => string, readonly formatNumber: (value: number|null, decimals: number) => string, readonly readTimeline: () => Readonly<{ readonly segments?: ReadonlyArray<object>, readonly chills?: ReadonlyArray<object> }>|null, readonly reportError: (scope: string, error: unknown) => void, readonly timelineState: () => Readonly<{ readonly chills?: ReadonlyArray<Readonly<{ readonly at_min: number, readonly from_temp_c: number, readonly to_temp_c: number }>> }>|null, readonly rows: () => ReadonlyArray<object> }} args
 */
export function whirlpoolTimelineDescriptors({
  formatTemp,
  formatNumber,
  readTimeline,
  reportError,
  timelineState,
  rows,
}) {
  return {
    whirlpoolTimelineState: {
      configurable: true,
      get() {
        try {
          const state = readTimeline();
          if (!state || !Array.isArray(state.segments)) return null;
          return state;
        } catch (err) {
          reportError("hops.whirlpoolTimeline", err);
          return null;
        }
      },
    },
    whirlpoolInferredChills: {
      configurable: true,
      get() {
        const state = timelineState();
        if (!state) return [];
        return (state.chills ?? []).map(
          (chill) =>
            `Chill inferred at ${formatNumber(chill.at_min, 1)} min: ` +
            `${formatTemp(chill.from_temp_c)} → ${formatTemp(chill.to_temp_c)}.`
        );
      },
    },
    whirlpoolZeroRestNote: {
      configurable: true,
      get() {
        const zeroRest = (rows() ?? []).filter(
          (row) => Number(row.minutes) === 0 && (Number(row.ibu) || 0) > 0
        );
        return zeroRest.length
          ? "A 0-minute charge contributes no IBU; its mass is not computed."
          : "";
      },
    },
  };
}
