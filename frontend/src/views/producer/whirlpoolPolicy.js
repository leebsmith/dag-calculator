import { hopDemandLine } from "./hopRows.js";
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

// Descriptor map for Object.defineProperties: the card merges it beside its own
// getters so the policy stays readable and the card file stays under its pin.
export function whirlpoolPolicyDescriptors({
  notes,
  formatTemp,
  formatMass,
  formatNumber,
  postBoilVolume,
  whirlpoolIbu,
}) {
  const bands = () => startBands(notes, formatTemp);
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
        return startBandValue(this.whirlpoolHopActiveRow?.initial_temp_c, bands());
      },
    },
    whirlpoolStartBandHint: {
      configurable: true,
      get() {
        return startBandHint(this.whirlpoolStartBandValue, bands());
      },
    },
    setWhirlpoolStartBand: {
      configurable: true,
      writable: true,
      value(bandId) {
        const band = this.whirlpoolStartBands.find((candidate) => candidate.value === bandId);
        if (!band || this.whirlpoolHopActiveIndex == null) return;
        this.patchDraftRow(this.whirlpoolHopActiveIndex, { initial_temp_c: band.mid });
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
          alphaMassKg: this.whirlpoolHopAlphaMassKg,
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
        const state = this.whirlpoolTimelineState;
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
        const zeroRest = (this.whirlpoolHopRows ?? []).filter(
          (row) => Number(row.minutes) === 0 && (Number(row.ibu) || 0) > 0
        );
        return zeroRest.length
          ? "A 0-minute charge contributes no IBU; its mass is not computed."
          : "";
      },
    },
  };
}
