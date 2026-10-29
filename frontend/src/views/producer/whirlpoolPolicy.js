// Whirlpool product-form policy: the row defaults, the seeded start-temperature
// bands, the band selector state, and the two advisory warnings. Pure over the
// rows, the notes and the form multiplier; the card supplies the formatters.

import { isFiniteNumber } from "../../utils.js";

export function makeWhirlpoolRow(hop, defaults) {
  const form = hop.product_form ?? "t90_pellet";
  const lupulin = form === "lupulin_pellet";
  const row = {
    hop_id: hop.id,
    name: hop.name,
    product_form: form,
    alpha_acid_pct: hop.alpha_acid_pct,
    duration_min: lupulin ? defaults.lupulinDurationMin : defaults.durationMin,
    initial_temp_c: lupulin ? defaults.lupulinInitialTempC : defaults.initialTempC,
    parts: 10,
    pct: 0,
  };
  if (isFiniteNumber(hop.t90_replacement_ratio)) {
    row.t90_replacement_ratio = hop.t90_replacement_ratio;
  }
  return row;
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

export function temperatureWarning(rows, formatTemp, formatNumber, utilizationFor) {
  const flowables = (rows ?? []).filter(
    (row) =>
      row.product_form === "flowable_extract" &&
      typeof row.initial_temp_c === "number" &&
      Number.isFinite(row.initial_temp_c)
  );
  if (!flowables.length) return "";
  const coolest = flowables.reduce((a, b) => (a.initial_temp_c <= b.initial_temp_c ? a : b));
  const multiplier = utilizationFor("flowable_extract", coolest.initial_temp_c);
  if (multiplier >= 1) return "";
  return (
    `Flowable extract at ${formatTemp(coolest.initial_temp_c)} disperses poorly: ` +
    `utilization falls to ${formatNumber(multiplier, 2)}× a T-90 pellet. ` +
    "Dose above 80 °C or agitate the whirlpool."
  );
}

export function doseWarning(rows, formatNumber) {
  const doses = (rows ?? [])
    .filter((row) => row.product_form === "flowable_extract")
    .map((row) => row.dose_g_per_gal)
    .filter((dose) => typeof dose === "number" && Number.isFinite(dose));
  if (!doses.length) return "";
  const worst = Math.max(...doses);
  return worst > 4
    ? `Flowable extract dose ${formatNumber(worst, 2)} g/gal exceeds the 4 g/gal saturation ceiling.`
    : "";
}

// Descriptor map for Object.defineProperties: the card merges it beside its own
// getters so the policy stays readable and the card file stays under its pin.
export function whirlpoolPolicyDescriptors({ notes, formatTemp, formatNumber, utilizationFor }) {
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
    whirlpoolHopTemperatureWarning: {
      configurable: true,
      get() {
        return temperatureWarning(
          this.whirlpoolHopRows,
          formatTemp,
          formatNumber,
          utilizationFor
        );
      },
    },
    whirlpoolHopDoseWarning: {
      configurable: true,
      get() {
        return doseWarning(this.whirlpoolHopRows, formatNumber);
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
  };
}

export function whirlpoolTimelineDescriptors({
  formatTemp,
  formatNumber,
  batchCurve,
  reportError,
  timelineFor,
}) {
  return {
    whirlpoolTimelineState: {
      configurable: true,
      get() {
        const curve = batchCurve();
        if (!curve) return null;
        try {
          return timelineFor(this.whirlpoolHopRows, curve);
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
        return state.chills.map(
          (chill) =>
            `Chill inferred at ${formatNumber(chill.atMin, 1)} min: ` +
            `${formatTemp(chill.fromTempC)} → ${formatTemp(chill.toTempC)}.`
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
