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

// Descriptor map for Object.defineProperties: the card merges it beside its own
// getters so the policy stays readable and the card file stays under its pin.
export function whirlpoolPolicyDescriptors({ notes, formatTemp }) {
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
