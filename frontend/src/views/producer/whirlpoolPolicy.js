import { coolingCeilingTable } from "../coolingCurve.js";
import { isFiniteNumber, toFiniteOrNull } from "../../utils.js";

// Whirlpool product-form policy: the row defaults, the seeded start-temperature
// bands, the band selector state, and the two advisory warnings. Pure over the
// rows, the notes and the form multiplier; the card supplies the formatters.


export function makeWhirlpoolRow(hop, defaults, catalogForm = null) {
  const form = catalogForm ?? hop.product_form ?? "t90_pellet";
  const lupulin = form === "lupulin_pellet";
  return {
    hop_id: hop.id,
    name: hop.name,
    product_form: form,
    alpha_acid_pct: hop.alpha_acid_pct,
    addition_at_min: lupulin ? defaults.lupulinAdditionAtMin : defaults.additionAtMin,
    initial_temp_c: lupulin ? defaults.lupulinInitialTempC : defaults.initialTempC,
    parts: 10,
    pct: 0,
  };
}

export function startBands(notes, formatTemp) {
  return Object.values(notes ?? {})
    .sort((a, b) => b.mid_temp - a.mid_temp)
    .map((band) => ({
      value: band.id,
      label: `${band.name} (${formatTemp(band.mid_temp)})`,
      mid: band.mid_temp,
      hint: band.description,
    }));
}

export function startBandValue(temp, bands) {
  if (typeof temp !== "number" || !Number.isFinite(temp)) return "custom";
  const band = bands.find((candidate) => Math.abs(candidate.mid - temp) < 0.05);
  return band?.value ?? "custom";
}

export function startBandHint(value, bands) {
  return bands.find((candidate) => candidate.value === value)?.hint ?? "";
}

export function readWhirlpoolCeiling(engine, resolve, nodes) {
  return coolingCeilingTable({
    segments: resolve(nodes.whirlpoolTimeline) ?? [],
    ambientC: Number(engine.get(nodes.whirlpoolAmbient)),
    kPerMin: 1 / Number(engine.get(nodes.whirlpoolCoolingTimeConstant)),
    knockoutMin: Number(engine.get(nodes.whirlpoolKnockout)),
  });
}

function ceilingInputsUsable(startTempC, ambientC, kPerMin, knockoutMin) {
  return [
    isFiniteNumber(startTempC),
    isFiniteNumber(ambientC),
    isFiniteNumber(kPerMin),
    kPerMin > 0,
    isFiniteNumber(knockoutMin),
    knockoutMin > 0,
  ].every(Boolean);
}

function inWhirlpoolWindow(at, knockoutMin) {
  return Number.isFinite(at) && at >= 0 && at <= knockoutMin + 1e-9;
}

export function whirlpoolDraftCeilings({
  rows,
  startTempC,
  ambientC,
  kPerMin,
  knockoutMin,
  toleranceC = 0.5,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return [];
  if (!ceilingInputsUsable(startTempC, ambientC, kPerMin, knockoutMin)) {
    return list.map(() => null);
  }
  const order = list
    .map((row, index) => ({ row, index }))
    .sort(
      (left, right) =>
        (Number(left.row.addition_at_min) || 0) - (Number(right.row.addition_at_min) || 0) ||
        left.index - right.index
    );
  const out = new Array(list.length).fill(null);
  let time = 0;
  let temp = startTempC;
  for (const { row, index } of order) {
    const at = toFiniteOrNull(row.addition_at_min);
    if (!inWhirlpoolWindow(at, knockoutMin)) continue;
    if (at > time) {
      temp = ambientC + (temp - ambientC) * Math.exp(-kPerMin * (at - time));
      time = at;
    }
    const posted = toFiniteOrNull(row.initial_temp_c);
    const above = isFiniteNumber(posted) && posted > temp + toleranceC;
    out[index] = { maxC: temp, above };
    if (isFiniteNumber(posted) && posted < temp - toleranceC) temp = posted;
  }
  return out;
}

export function whirlpoolCeilingBadge(app, row, columnId) {
  if (columnId !== "ceiling_c" || !row?.ceiling_above) return null;
  return { className: "text-warning", text: "above" };
}


