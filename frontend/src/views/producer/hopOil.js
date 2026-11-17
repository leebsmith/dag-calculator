// Hop oil charge: how much oil a hop bill adds, per litre.
//
// One equation, two constants. The variety supplies mL/100 g, the form supplies
// a multiplier against T-90, and the density converts a volume of oil to a mass.
// There is no retention term: oils volatilise and adsorb, but nothing here is
// measured for that, so the model reports what was *added* and never what
// reached the glass.
//
// A hop without an oil figure contributes nothing and is counted, so the caller
// can say how many charges it could see rather than implying a complete sum.

import { formatWithDecimals, isFiniteNumber } from "../../utils.js";

const DENSITY = "oil_density_g_per_ml";
const LUPULIN = "oil_form_multiplier_lupulin";

// Measured or assumed, and never silently mixed: only lupulin has a published
// ratio against T-90 (YCH 2022, 26 varieties). Whole cone has no number, so it
// is treated as the reference like T-90; extract has no per-variety oil at all.
export function oilFormMultiplier(productForm, constants) {
  if (productForm === "lupulin_pellet") return constants?.[LUPULIN]?.value ?? null;
  if (productForm === "flowable_extract") return null;
  return 1;
}

export function oilFormBasis(productForm) {
  if (productForm === "lupulin_pellet") return "measured";
  if (productForm === "flowable_extract") return "unpublished";
  return "reference";
}

/**
 * Oil this charge adds to the batch, in mg per litre.
 * @pure
 * @param {{ readonly massKg?: number, readonly oilMlPer100g?: number, readonly multiplier?: number|null, readonly volumeL?: number, readonly density?: number }} args
 * @returns {number|null} null when any input is missing — absence is not zero
 */
export function oilChargeMgPerL({ massKg, oilMlPer100g, multiplier, volumeL, density }) {
  if (!isFiniteNumber(massKg) || !isFiniteNumber(oilMlPer100g)) return null;
  if (!isFiniteNumber(multiplier) || !isFiniteNumber(volumeL) || !isFiniteNumber(density)) return null;
  if (!(massKg > 0) || !(volumeL > 0) || !(density > 0) || multiplier <= 0) return null;
  const oilMl = (massKg * 1000 * oilMlPer100g * multiplier) / 100;
  return (oilMl * density * 1000) / volumeL;
}

/**
 * Whole-table charge plus the count of charges that could be priced.
 * @pure
 * @param {{ readonly rows?: ReadonlyArray<object>, readonly volumeL?: number, readonly constants?: object }} args
 */
export function oilChargeSummary({ rows, volumeL, constants }) {
  const charges = [];
  for (const row of rows ?? []) {
    const multiplier = oilFormMultiplier(row?.product_form, constants);
    const value = oilChargeMgPerL({
      massKg: row?.mass_kg,
      oilMlPer100g: row?.total_oil_ml_per_100g,
      multiplier,
      volumeL,
      density: constants?.[DENSITY]?.value,
    });
    charges.push(value);
  }
  const priced = charges.filter((value) => value !== null);
  const total = priced.reduce((sum, value) => sum + value, 0);
  return { total, priced: priced.length, rows: charges.length };
}

/**
 * The oil a hop bill adds, in mg/L, with how many charges could be priced. An
 * unpriced charge is not a zero: it is a hop whose figure nobody publishes.
 * @pure
 * @param {{ readonly rows?: ReadonlyArray<object>, readonly volumeL?: number, readonly constants?: object, readonly formatNumber: (value: number|null, decimals: number) => string }} args
 */
export function hopOilLineText({ rows, volumeL, constants, formatNumber }) {
  const summary = oilChargeSummary({ rows, volumeL, constants });
  if (!(summary.priced > 0)) return "";
  const parts = [`oil added ${formatNumber(summary.total, 1)} mg/L`];
  if (summary.priced < summary.rows) parts.push(`${summary.priced} of ${summary.rows} charges priced`);
  return parts.join(" · ");
}

/**
 * The card descriptor for the charge line, so the hop logic spreads one entry.
 * @pure
 * @param {{ readonly rows?: () => ReadonlyArray<object>, readonly postBoilVolume?: () => number|null, readonly constants?: object, readonly formatNumber: (value: number|null, decimals: number) => string }} args
 */
export function hopOilDescriptor({ rows, postBoilVolume, constants, formatNumber }) {
  return {
    hopOilLine: {
      configurable: true,
      get() {
        return hopOilLineText({
          rows: rows(),
          volumeL: postBoilVolume(),
          constants,
          formatNumber,
        });
      },
    },
  };
}

/**
 * Per-table oil charges, keyed by the collection the report summarises. The
 * integrity check only accepts a collection path or "overall", and a charge per
 * table is a better number than a combined one anyway.
 * @pure
 * @param {{ readonly artifact: object, readonly engine: object, readonly nodes: object, readonly resolvedList: Function, readonly reportError: Function }} args
 */
export function hopOilSummaries({ artifact, engine, nodes, resolvedList, reportError }) {
  const volumeL = readNumber(engine, nodes.postBoilVolume, reportError);
  if (!(volumeL > 0)) return {};
  const tables = [
    [nodes.collection, nodes.boilRows],
    [nodes.whirlpoolCollection, nodes.whirlpoolRows],
  ];
  const summaries = {};
  for (const [collection, rowsPath] of tables) {
    const authored = engine.get(collection) ?? [];
    if (authored.length === 0) continue;
    const solved = resolvedList(engine, rowsPath, reportError);
    const rows = authored.map((row, index) => ({ ...row, mass_kg: solved[index]?.mass_kg }));
    const summary = oilChargeSummary({ rows, volumeL, constants: artifact.constants });
    if (!(summary.priced > 0)) continue;
    const amount = formatWithDecimals(summary.total, 1);
    const text =
      summary.priced < summary.rows
        ? `${amount} mg/L \u00b7 ${summary.priced} of ${summary.rows} priced`
        : `${amount} mg/L`;
    summaries[collection] = { oil: { text, number: amount, unit: "mg/L" } };
  }
  return summaries;
}

function readNumber(engine, path, reportError) {
  try {
    const value = engine.resolve(path);
    return typeof value === "number" ? value : null;
  } catch (err) {
    reportError("report.oil.volume", err);
    return null;
  }
}
