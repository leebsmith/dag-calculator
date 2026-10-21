// Boil-hops card: IBU-led additions with Tinseth mass back-calculation.
// See plans/card-refactor.md (trial card).

import { installCatalogDraft } from "./catalogDraft.js";
import { massFromIbu } from "../../views/hops.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { HOP_NODES as N } from "../../views/registry/hops.js";
import { countLabel, cycleUnit, formatPercent, formatWithDecimals, isFiniteNumber, resultCounter } from "../../utils.js";
import { reportError } from "../../observability.js";

const HOP_MASS_UNITS = ["oz", "g", "lb", "kg"];

const MAX_VISIBLE = 25;

function makeRow(hop) {
  return {
    hop_id: hop.id,
    name: hop.name,
    alpha_acid_pct: hop.alpha_acid_pct,
    boil_time_fraction: 1,
    parts: 10,
    pct: 0,
  };
}

// IBU share -> IBU -> Tinseth mass, using the solver's pre-boil gravity and
// post-boil volume. Percent -> IBU here is host-side, display-only.
function computeHopRows(engine) {
  const rows = engine.get(N.collection) ?? [];
  const boilIbu = Number(engine.get(N.boilIbu)) || 0;
  const boilTimeMin = Number(engine.get(N.boilTime)) || 0;

  let gravity = null;
  let volume = null;
  try {
    gravity = engine.resolve(N.preBoilGravity);
  } catch (err) {
    reportError("hops.preBoilGravity", err);
    gravity = null;
  }
  try {
    volume = engine.resolve(N.postBoilVolume);
  } catch (err) {
    reportError("hops.postBoilVolume", err);
    volume = null;
  }

  return rows.map((row) => {
    const minutes = (Number(row.boil_time_fraction) || 0) * boilTimeMin;
    const ibu = (Number(row.pct) || 0) * boilIbu;
    const mass = massFromIbu(ibu, Number(row.alpha_acid_pct) || 0, minutes, gravity, volume);
    return { ...row, minutes, ibu, mass_kg: mass };
  });
}

export function registerHopCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "hop",
    Cap: "Hop",
    nodeId: N.collection,
    seedKey: "hops",
    idField: "hop_id",
    categoryField: "purpose",
    makeRow,
    maxVisible: MAX_VISIBLE,
    itemMeta: (item) => [
      item.purpose || "Hop",
      isFiniteNumber(item.alpha_acid_pct)
        ? `${formatPercent(item.alpha_acid_pct)} alpha`
        : "alpha n/a",
      item.origin,
    ],
  });

  const { engine, artifact } = ctx;

  // Hop masses are read in a hop-friendly unit, independent of the master mass
  // unit (which may be lb for grain). Transient: defaults to oz each session.
  // The unit is passed in (read via `this` by callers) so Alpine tracks it.
  const formatMass = (kg, unit = "oz") => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    const decimals = unit === "g" ? 0 : 2;
    return `${value.toFixed(decimals)} ${UNIT_SYMBOLS.mass?.[unit] ?? unit}`;
  };

  Object.assign(app, {
    // Card readouts (refreshed by refreshHopCard).
    hopRows: [],
    hopMassUnit: "oz",

    toggleHopMassUnit() {
      this.hopMassUnit = cycleUnit(HOP_MASS_UNITS, this.hopMassUnit);
    },

    hopMass(row) {
      return formatMass(row?.mass_kg, this.hopMassUnit);
    },

    hopAlpha(row) {
      return typeof row?.alpha_acid_pct === "number"
        ? `${(row.alpha_acid_pct * 100).toFixed(1)}%`
        : "—";
    },

    hopBoilPct(row) {
      return typeof row?.boil_time_fraction === "number"
        ? `${Math.round(row.boil_time_fraction * 100)}%`
        : "—";
    },

    hopMinutes(row) {
      return typeof row?.minutes === "number" ? `${row.minutes.toFixed(0)} min` : "—";
    },

    hopIbu(row) {
      return typeof row?.ibu === "number" ? row.ibu.toFixed(1) : "—";
    },

    hopPct(row) {
      return typeof row?.pct === "number" ? `${(row.pct * 100).toFixed(1)}%` : "—";
    },
  });

  Object.defineProperties(app, {
    boilIbuField: {
      configurable: true,
      get() {
        return (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.boilIbu) ?? null;
      },
    },
    whirlpoolIbuField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.whirlpoolIbu) ?? null
        );
      },
    },
    hopDraftPartsTotal: {
      configurable: true,
      get() {
        return (this.draftRows ?? []).reduce((sum, r) => sum + (Number(r.parts) || 0), 0);
      },
    },
    hopDraftSummary: {
      configurable: true,
      get() {
        const additions = countLabel(this.draftRows.length, "addition");
        return `${additions} · ${formatWithDecimals(this.hopDraftPartsTotal, 1)} parts`;
      },
    },
    hopResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.hopVisibleCatalog.length,
          total: this.hopFilteredCatalog.length,
          noun: "hop",
          truncated: this.hopCatalogTruncated,
          truncatedHint: "refine search or purpose filters",
        });
      },
    },
    hopTotalMassDisplay: {
      configurable: true,
      get() {
        const masses = (this.hopRows ?? [])
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return this.hopRows?.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
  });
}

export function refreshHopCard(app, ctx) {
  app.hopRows = computeHopRows(ctx.engine);
}
