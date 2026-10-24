// Hops card: boil additions (Tinseth) and whirlpool additions (Arrhenius
// cooling integral), both authored by IBU share.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { massFromIbu } from "../../views/hops.js";
import {
  DEFAULT_AMBIENT_TEMP_C,
  DEFAULT_COOLING_TIME_CONSTANT_MIN,
  DEFAULT_INITIAL_TEMP_C,
  DEFAULT_K_PER_MIN,
  DEFAULT_REST_DURATION_MIN,
  whirlpoolMassKg,
} from "../../views/whirlpool.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS } from "../../views/registry/units.js";
import { HOP_NODES as N } from "../../views/registry/hops.js";
import { countLabel, cycleUnit, formatPercent, formatWithDecimals, isFiniteNumber, resultCounter } from "../../utils.js";
import { reportError } from "../../observability.js";

const HOP_MASS_UNITS = ["oz", "g", "lb", "kg"];

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
    duration_min: DEFAULT_REST_DURATION_MIN,
    initial_temp_c: DEFAULT_INITIAL_TEMP_C,
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
  } catch {
    return null;
  }
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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

function whirlpoolContext(engine) {
  const whirlpoolIbu = Number(engine.get(N.whirlpoolIbu)) || 0;
  const ambientTempC = finiteNumber(engine.get(N.whirlpoolAmbient), DEFAULT_AMBIENT_TEMP_C);
  const timeConstantMin = finiteNumber(
    engine.get(N.whirlpoolCoolingTimeConstant),
    DEFAULT_COOLING_TIME_CONSTANT_MIN
  );
  return {
    whirlpoolIbu,
    ambientTempC,
    kPerMin: timeConstantMin > 0 ? 1 / timeConstantMin : DEFAULT_K_PER_MIN,
    gravity: resolveOrNull(engine, N.postBoilGravity),
    volume: resolveOrNull(engine, N.postBoilVolume),
  };
}

function computeWhirlpoolRow(row, context) {
  const { whirlpoolIbu, ambientTempC, kPerMin, gravity, volume } = context;
  const minutes = Number(row.duration_min) || 0;
  const initialTempC = Number(row.initial_temp_c) || DEFAULT_INITIAL_TEMP_C;
  const productForm = row.product_form ?? "t90_pellet";
  const ibu = (Number(row.pct) || 0) * whirlpoolIbu;
  const mass = whirlpoolMassKg({
    ibu,
    alphaFraction: Number(row.alpha_acid_pct) || 0,
    volumeL: volume,
    gravity,
    durationMin: minutes,
    initialTempC,
    ambientTempC,
    kPerMin,
    productForm,
  });
  const doseGPerGal =
    typeof mass === "number" && volume > 0
      ? (mass * 1000) / (volume / 3.785411784)
      : null;
  return { ...row, product_form: productForm, minutes, ibu, mass_kg: mass, dose_g_per_gal: doseGPerGal };
}

function computeWhirlpoolRows(engine) {
  const rows = engine.get(N.whirlpoolCollection) ?? [];
  const context = whirlpoolContext(engine);
  return rows.map((row) => computeWhirlpoolRow(row, context));
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

  // Both pools are seeded from the saved Mass preference (grams when nothing is
  // stored — hops are charged in grams, and the dimension's base unit is kg).
  // They stay independent after that: each has its own pill.
  const massUnit = ui.unitMode.mass ?? "g";

  const formatMass = (kg, unit) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    const decimals = unit === "g" ? 1 : 2;
    return `${value.toFixed(decimals)} ${UNIT_SYMBOLS.mass?.[unit] ?? unit}`;
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
    hopMassUnit: massUnit,
    whirlpoolHopMassUnit: massUnit,
    whirlpoolHopForms: WHIRLPOOL_HOP_FORMS,
    whirlpoolHopCatalogForm: "t90_pellet",

    setWhirlpoolHopCatalogForm(value) {
      this.whirlpoolHopCatalogForm = value;
      this.whirlpoolHopSearch = "";
      this.whirlpoolHopCategoryFilter = [];
    },

    toggleHopMassUnit() {
      this.hopMassUnit = cycleUnit(HOP_MASS_UNITS, this.hopMassUnit);
    },

    toggleWhirlpoolHopMassUnit() {
      this.whirlpoolHopMassUnit = cycleUnit(HOP_MASS_UNITS, this.whirlpoolHopMassUnit);
    },

    hopMass(row) {
      return formatMass(row?.mass_kg, this.hopMassUnit);
    },

    whirlpoolHopMass(row) {
      return formatMass(row?.mass_kg, this.whirlpoolHopMassUnit);
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
        const computed = computeWhirlpoolRow(row, whirlpoolContext(ctx.engine));
        if (!isFiniteNumber(computed.mass_kg)) return "";
        const equivalent = computed.mass_kg * row.t90_replacement_ratio;
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
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.whirlpoolHopMassUnit);
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
  app.hopRows = computeHopRows(ctx.engine);
  app.whirlpoolHopRows = computeWhirlpoolRows(ctx.engine);
}

export const KEYS = [
  ...catalogDraftKeys("hop", "Hop"),
  ...catalogDraftKeys("whirlpoolHop", "WhirlpoolHop"),
  "hopRows",
  "whirlpoolHopRows",
  "hopMassUnit",
  "whirlpoolHopMassUnit",
  "whirlpoolHopForms",
  "whirlpoolHopCatalogForm",
  "setWhirlpoolHopCatalogForm",
  "toggleHopMassUnit",
  "toggleWhirlpoolHopMassUnit",
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
