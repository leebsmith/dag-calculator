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

export function hopMassText(row, unit, formatMass) {
  return formatMass(row?.mass_kg, unit);
}

export function hopTempText(row, formatTemp) {
  return formatTemp(row?.initial_temp_c);
}

export function hopAlphaRangeText(cache, row) {
  return hopAlphaStockLabel(hopStockRecord(cache, row?.hop_id));
}

export function hopAlphaOutsideStockFor(cache, row) {
  return hopAlphaIsOutsideStock(row, hopStockRecord(cache, row?.hop_id));
}

export function boilRowsFor({ rows, results, boilIbu, boilTimeMin }) {
  return mergeBoilRows(rows, results, boilIbu, boilTimeMin);
}

export function whirlpoolRowsFor({ rows, results, whirlpoolIbu, volume }) {
  return mergeWhirlpoolRows(rows, results, whirlpoolIbu, volume);
}

export function draftPartsTotal(rows) {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
}

export function draftSummary(rows) {
  const list = rows ?? [];
  return `${countLabel(list.length, "addition")} · ${formatWithDecimals(
    draftPartsTotal(list),
    1
  )} parts`;
}

export function catalogResultLabel({ visible, filtered, truncated }) {
  return resultCounter({
    shown: visible,
    total: filtered,
    noun: "hop",
    truncated,
    truncatedHint: "refine search or purpose filters",
  });
}

export function massTotalKg(rows, boundaryMassKg) {
  if (isFiniteNumber(boundaryMassKg)) return boundaryMassKg;
  return (rows ?? []).reduce(
    (sum, row) => (isFiniteNumber(row?.mass_kg) ? sum + row.mass_kg : sum),
    0
  );
}

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

export function combinedMassDisplay({ boilRows, whirlpoolRows, boundaryMassKg, unit, formatMass }) {
  const rows = [...(boilRows ?? []), ...(whirlpoolRows ?? [])];
  if (!rows.length) return "—";
  return massTotalDisplay({ rows, boundaryMassKg, unit, formatMass });
}

export function hopCatalogEntries(cache, form) {
  if (form === "t90_pellet" || form === "whole_cone") {
    return Object.values(cache?.seeds?.hops ?? {});
  }
  return Object.values(cache?.seeds?.hopProducts ?? {}).filter(
    (item) => item.product_form === form
  );
}

export function hopCatalogItemMeta(item) {
  return [
    item.product_form ? item.brand ?? "Product" : item.purpose || "Hop",
    isFiniteNumber(item.alpha_acid_pct)
      ? `${formatPercent(item.alpha_acid_pct)} alpha`
      : "alpha n/a",
    item.product_form ? item.manufacturer : item.origin,
  ];
}

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
