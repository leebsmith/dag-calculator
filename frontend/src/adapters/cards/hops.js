// Boil-hops card: IBU-led additions with Tinseth mass back-calculation.
// See plans/card-refactor.md (trial card).

import { installCatalogDraft } from "./catalogDraft.js";
import { massFromIbu } from "../../views/hops.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";

const NODE = "batch.boil_hops";
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
  const rows = engine.get(NODE) ?? [];
  const boilIbu = Number(engine.get("batch.boil_target_ibu")) || 0;
  const boilTimeMin = Number(engine.get("batch.boil_time_min")) || 0;

  let gravity = null;
  let volume = null;
  try {
    gravity = engine.resolve("solver.batch.cascade.sg_pre_boil");
  } catch {
    gravity = null;
  }
  try {
    volume = engine.resolve("solver.batch.cascade.v_post_boil");
  } catch {
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
    nodeId: NODE,
    seedKey: "hops",
    idField: "hop_id",
    categoryField: "purpose",
    makeRow,
    maxVisible: MAX_VISIBLE,
  });

  const { engine, artifact } = ctx;

  // Hop masses are read in a hop-friendly unit, independent of the master mass
  // unit (which may be lb for grain). Transient: defaults to oz each session.
  const formatMass = (kg) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const unit = app.hopMassUnit ?? "oz";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    const decimals = unit === "g" ? 0 : 2;
    return `${value.toFixed(decimals)} ${UNIT_SYMBOLS.mass?.[unit] ?? unit}`;
  };

  Object.assign(app, {
    // Card readouts (refreshed by refreshHopCard).
    hopRows: [],
    hopMassUnit: "oz",

    toggleHopMassUnit() {
      const units = ["oz", "g", "lb", "kg"];
      const index = units.indexOf(this.hopMassUnit);
      this.hopMassUnit = units[(index + 1) % units.length];
    },

    hopMass(row) {
      return formatMass(row?.mass_kg);
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
        return (this.fieldsBySlice.hops ?? []).find((f) => f.id === "batch.boil_target_ibu") ?? null;
      },
    },
    whirlpoolIbuField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice.hops ?? []).find((f) => f.id === "batch.whirlpool_target_ibu") ?? null
        );
      },
    },
    hopDraftPartsTotal: {
      configurable: true,
      get() {
        return (this.draftRows ?? []).reduce((sum, r) => sum + (Number(r.parts) || 0), 0);
      },
    },
    hopTotalMassDisplay: {
      configurable: true,
      get() {
        const masses = (this.hopRows ?? [])
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return this.hopRows?.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0));
      },
    },
  });
}

export function refreshHopCard(app, ctx) {
  app.hopRows = computeHopRows(ctx.engine);
}
