// Hops card: boil additions (Tinseth) and whirlpool additions (Arrhenius
// cooling integral), both authored by IBU share.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS, unitDecimals } from "../../views/registry/units.js";
import { HOP_NODES as N, WHIRLPOOL_ROW_DEFAULTS } from "../../views/registry/hops.js";
import { countLabel, cycleUnit, formatPercent, formatWithDecimals, isFiniteNumber, resultCounter } from "../../utils.js";
import { reportError } from "../../observability.js";

const HOP_MASS_UNITS = ["oz", "g", "lb", "kg"];
const HOP_MASS_KEY = "hop.mass";

const WHIRLPOOL_HOP_FORMS = [
  { value: "t90_pellet", label: "T-90 pellets" },
  { value: "flowable_extract", label: "Flowable CO₂ extract" },
];

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

function makeWhirlpoolRow(hop) {
  const row = {
    hop_id: hop.id,
    name: hop.name,
    product_form: hop.product_form ?? "t90_pellet",
    alpha_acid_pct: hop.alpha_acid_pct,
    duration_min: WHIRLPOOL_ROW_DEFAULTS.durationMin,
    initial_temp_c: WHIRLPOOL_ROW_DEFAULTS.initialTempC,
    parts: 10,
    pct: 0,
  };
  if (isFiniteNumber(hop.t90_replacement_ratio)) {
    row.t90_replacement_ratio = hop.t90_replacement_ratio;
  }
  return row;
}

function resolveOrNull(engine, path) {
  try {
    return engine.resolve(path);
  } catch (err) {
    reportError("hops.resolve", err);
    return null;
  }
}

function mergeBoilRows(rows, results, boilIbu, boilTimeMin) {
  return (rows ?? []).map((row, index) => {
    const result = results?.[index] ?? {};
    const minutes = Number(result.minutes);
    const ibu = Number(result.ibu);
    return {
      ...row,
      minutes: Number.isFinite(minutes)
        ? minutes
        : (Number(row.boil_time_fraction) || 0) * boilTimeMin,
      ibu: Number.isFinite(ibu) ? ibu : (Number(row.pct) || 0) * boilIbu,
      mass_kg: typeof result.mass_kg === "number" ? result.mass_kg : null,
    };
  });
}

function mergeWhirlpoolRows(rows, results, whirlpoolIbu, volume) {
  return (rows ?? []).map((row, index) => {
    const result = results?.[index] ?? {};
    const minutes = Number(result.minutes);
    const ibu = Number(result.ibu);
    const mass = typeof result.mass_kg === "number" ? result.mass_kg : null;
    const doseGPerGal =
      typeof mass === "number" && volume > 0 ? (mass * 1000) / (volume / 3.785411784) : null;
    return {
      ...row,
      product_form: row.product_form ?? "t90_pellet",
      minutes: Number.isFinite(minutes) ? minutes : Number(row.duration_min) || 0,
      ibu: Number.isFinite(ibu) ? ibu : (Number(row.pct) || 0) * whirlpoolIbu,
      mass_kg: mass,
      effective_minutes:
        typeof result.effective_minutes === "number" ? result.effective_minutes : null,
      dose_g_per_gal: doseGPerGal,
    };
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

  installCatalogDraft(app, ctx, {
    prefix: "whirlpoolHop",
    Cap: "WhirlpoolHop",
    nodeId: N.whirlpoolCollection,
    seedKey: "hops",
    catalog: () => {
      const key = app.whirlpoolHopCatalogForm === "flowable_extract" ? "hopProducts" : "hops";
      return Object.values(ctx.cache.seeds[key] ?? {});
    },
    catalogNameOf: (item) =>
      item.product_form === "flowable_extract" ? "hop_product" : "hop",
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id",
    categoryField: "purpose",
    makeRow: makeWhirlpoolRow,
    maxVisible: MAX_VISIBLE,
    itemMeta: (item) => [
      item.product_form === "flowable_extract" ? item.brand ?? "Extract" : item.purpose || "Hop",
      isFiniteNumber(item.alpha_acid_pct)
        ? `${formatPercent(item.alpha_acid_pct)} alpha`
        : "alpha n/a",
      item.product_form === "flowable_extract" ? item.manufacturer : item.origin,
    ],
  });

  const { engine, artifact, ui } = ctx;

  const formatMass = (kg, unit) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    return `${value.toFixed(unitDecimals("mass", unit))} ${UNIT_SYMBOLS.mass?.[unit] ?? unit}`;
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
    return `${formatWithDecimals(value, 1)} ${UNIT_SYMBOLS.temperature?.[unitId] ?? unitId}`;
  };

  Object.assign(app, {
    hopRows: [],
    whirlpoolHopRows: [],
    whirlpoolHopForms: WHIRLPOOL_HOP_FORMS,
    whirlpoolHopCatalogForm: "t90_pellet",

    setWhirlpoolHopCatalogForm(value) {
      this.whirlpoolHopCatalogForm = value;
      this.whirlpoolHopSearch = "";
      this.whirlpoolHopCategoryFilter = [];
    },

    toggleHopMassUnit() {
      const inherited = this.unitMode?.mass ?? "g";
      const next = cycleUnit(HOP_MASS_UNITS, this.hopMassUnit);
      this.setFieldUnit(HOP_MASS_KEY, next === inherited ? null : next);
    },

    hopMass(row) {
      return formatMass(row?.mass_kg, this.hopMassUnit);
    },

    whirlpoolHopMass(row) {
      return formatMass(row?.mass_kg, this.hopMassUnit);
    },

    hopForm(row) {
      const value = row?.product_form ?? "t90_pellet";
      return WHIRLPOOL_HOP_FORMS.find((form) => form.value === value)?.label ?? value;
    },

    hopAlpha(row) {
      return typeof row?.alpha_acid_pct === "number"
        ? `${(row.alpha_acid_pct * 100).toFixed(1)}%`
        : "—";
    },

    // The batch row owns the measured value; the catalogue's alpha band is
    // context (a descriptive range, never a gate).
    hopAlphaInput(row) {
      return typeof row?.alpha_acid_pct === "number"
        ? Number((row.alpha_acid_pct * 100).toFixed(2))
        : "";
    },

    hopAlphaRange(row) {
      const record = ctx.cache.references.hop?.[row?.hop_id];
      const lo = record?.alpha_acid_min_pct;
      const hi = record?.alpha_acid_max_pct;
      if (!isFiniteNumber(lo) || !isFiniteNumber(hi)) return "";
      return `stock ${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}%`;
    },

    hopAlphaOutsideStock(row) {
      const record = ctx.cache.references.hop?.[row?.hop_id];
      const lo = record?.alpha_acid_min_pct;
      const hi = record?.alpha_acid_max_pct;
      const value = row?.alpha_acid_pct;
      if (!isFiniteNumber(lo) || !isFiniteNumber(hi) || !isFiniteNumber(value)) return false;
      return value < lo || value > hi;
    },

    // Batch-scoped measurement edit: the row is batch data, not a record. The
    // IBU -> mass solve reads this value, so the mass re-solves immediately.
    setHopAlpha(kind, index, value) {
      const nodeId = kind === "whirlpool" ? N.whirlpoolCollection : N.collection;
      const rows = (engine.get(nodeId) ?? []).map((row) => ({ ...row }));
      const row = rows[index];
      if (!row) return;
      const pct = Number(value);
      row.alpha_acid_pct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : 0;
      engine.setCollection(nodeId, rows);
      this.scheduleSolve();
      this.notify();
    },

    hopBoilPct(row) {
      return typeof row?.boil_time_fraction === "number"
        ? `${Math.round(row.boil_time_fraction * 100)}%`
        : "—";
    },

    hopMinutes(row) {
      return typeof row?.minutes === "number" ? `${row.minutes.toFixed(0)} min` : "—";
    },

    hopTemp(row) {
      return formatTemp(row?.initial_temp_c);
    },

    hopIbu(row) {
      return typeof row?.ibu === "number" ? row.ibu.toFixed(1) : "—";
    },

    hopPct(row) {
      return typeof row?.pct === "number" ? `${(row.pct * 100).toFixed(1)}%` : "—";
    },
  });

  Object.defineProperties(app, {
    hopMassUnit: {
      configurable: true,
      get() {
        return this.unitMode?.[HOP_MASS_KEY] ?? this.unitMode?.mass ?? "g";
      },
    },
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
    totalIbuField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.totalIbu) ?? null
        );
      },
    },
    whirlpoolAmbientField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.whirlpoolAmbient) ?? null
        );
      },
    },
    whirlpoolCoolingField: {
      configurable: true,
      get() {
        return (
          (this.fieldsBySlice[N.slice] ?? []).find(
            (f) => f.id === N.whirlpoolCoolingTimeConstant
          ) ?? null
        );
      },
    },
    whirlpoolHopT90Equivalent: {
      configurable: true,
      get() {
        const row = this.whirlpoolHopActiveRow;
        if (
          !row ||
          row.product_form !== "flowable_extract" ||
          !isFiniteNumber(row.t90_replacement_ratio)
        ) {
          return "";
        }
        const saved = this.whirlpoolHopRows[this.whirlpoolHopActiveIndex];
        if (!isFiniteNumber(saved?.mass_kg)) return "";
        const equivalent = saved.mass_kg * row.t90_replacement_ratio;
        return `${formatMass(equivalent, "g")} T-90 equivalent (1:${row.t90_replacement_ratio})`;
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
    whirlpoolHopDraftPartsTotal: {
      configurable: true,
      get() {
        return (this.draftRows ?? []).reduce((sum, r) => sum + (Number(r.parts) || 0), 0);
      },
    },
    whirlpoolHopDraftSummary: {
      configurable: true,
      get() {
        const additions = countLabel(this.draftRows.length, "addition");
        return `${additions} · ${formatWithDecimals(this.whirlpoolHopDraftPartsTotal, 1)} parts`;
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
    whirlpoolHopResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.whirlpoolHopVisibleCatalog.length,
          total: this.whirlpoolHopFilteredCatalog.length,
          noun: "hop",
          truncated: this.whirlpoolHopCatalogTruncated,
          truncatedHint: "refine search or purpose filters",
        });
      },
    },
    boilHopTotalMassDisplay: {
      configurable: true,
      get() {
        const rows = this.hopRows ?? [];
        const masses = rows
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return rows.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
    hopTotalMassKg: {
      configurable: true,
      get() {
        const rows = [...(this.hopRows ?? []), ...(this.whirlpoolHopRows ?? [])];
        return rows.reduce(
          (sum, r) =>
            typeof r.mass_kg === "number" && Number.isFinite(r.mass_kg) ? sum + r.mass_kg : sum,
          0
        );
      },
    },
    hopTotalMassDisplay: {
      configurable: true,
      get() {
        const rows = [...(this.hopRows ?? []), ...(this.whirlpoolHopRows ?? [])];
        const masses = rows
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return rows.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
    whirlpoolHopTotalMassDisplay: {
      configurable: true,
      get() {
        const rows = this.whirlpoolHopRows ?? [];
        const masses = rows
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return rows.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
    whirlpoolHopDoseWarning: {
      configurable: true,
      get() {
        const doses = (this.whirlpoolHopRows ?? [])
          .filter((r) => r.product_form === "flowable_extract")
          .map((r) => r.dose_g_per_gal)
          .filter((d) => typeof d === "number" && Number.isFinite(d));
        if (!doses.length) return "";
        const worst = Math.max(...doses);
        return worst > 4
          ? `Flowable extract dose ${worst.toFixed(2)} g/gal exceeds the 4 g/gal saturation ceiling.`
          : "";
      },
    },
  });
}

export function refreshHopCard(app, ctx) {
  const engine = ctx.engine;
  const boilIbu = Number(engine.get(N.boilIbu)) || 0;
  const boilTimeMin = Number(engine.get(N.boilTime)) || 0;
  const whirlpoolIbu = Number(engine.get(N.whirlpoolIbu)) || 0;
  const volume = resolveOrNull(engine, N.postBoilVolume);
  app.hopRows = mergeBoilRows(
    engine.get(N.collection),
    resolveOrNull(engine, N.boilRows),
    boilIbu,
    boilTimeMin
  );
  app.whirlpoolHopRows = mergeWhirlpoolRows(
    engine.get(N.whirlpoolCollection),
    resolveOrNull(engine, N.whirlpoolRows),
    whirlpoolIbu,
    volume
  );
}

export const KEYS = [
  ...catalogDraftKeys("hop", "Hop"),
  ...catalogDraftKeys("whirlpoolHop", "WhirlpoolHop"),
  "hopRows",
  "whirlpoolHopRows",
  "hopMassUnit",
  "whirlpoolHopForms",
  "whirlpoolHopCatalogForm",
  "setWhirlpoolHopCatalogForm",
  "toggleHopMassUnit",
  "hopMass",
  "whirlpoolHopMass",
  "hopForm",
  "hopAlpha",
  "hopAlphaInput",
  "hopAlphaRange",
  "hopAlphaOutsideStock",
  "setHopAlpha",
  "hopBoilPct",
  "hopMinutes",
  "hopTemp",
  "hopIbu",
  "hopPct",
  "boilIbuField",
  "whirlpoolIbuField",
  "totalIbuField",
  "whirlpoolAmbientField",
  "whirlpoolCoolingField",
  "whirlpoolHopT90Equivalent",
  "hopDraftPartsTotal",
  "hopDraftSummary",
  "whirlpoolHopDraftPartsTotal",
  "whirlpoolHopDraftSummary",
  "hopResultLabel",
  "whirlpoolHopResultLabel",
  "boilHopTotalMassDisplay",
  "hopTotalMassKg",
  "hopTotalMassDisplay",
  "whirlpoolHopTotalMassDisplay",
  "whirlpoolHopDoseWarning",
];
