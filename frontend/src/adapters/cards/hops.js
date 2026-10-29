// Hops card: boil additions (Tinseth) and whirlpool additions (Arrhenius
// cooling integral), both authored by IBU share.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { UNIT_SYMBOLS, unitDecimals } from "../../views/registry/units.js";
import { HOP_NODES as N, WHIRLPOOL_ROW_DEFAULTS } from "../../views/registry/hops.js";
import {
  hopAlphaInputValue,
  hopAlphaIsOutsideStock,
  hopAlphaLabel,
  hopAlphaStockLabel,
  hopBoilPctLabel,
  hopFormLabel,
  hopIbuLabel,
  hopMinutesLabel,
  hopPctLabel,
  mergeBoilRows,
  mergeWhirlpoolRows,
  WHIRLPOOL_HOP_FORMS,
} from "../../views/producer/hopRows.js";
import { countLabel, cycleUnit, formatPercent, formatValueWithUnit, formatWithDecimals, isFiniteNumber, resultCounter, unitSymbol } from "../../utils.js";
import { reportError } from "../../observability.js";
import { productFormUtilization, whirlpoolTimeline } from "../../views/whirlpool.js";
import {
  makeWhirlpoolRow,
  whirlpoolPolicyDescriptors,
  whirlpoolTimelineDescriptors,
} from "../../views/producer/whirlpoolPolicy.js";

const HOP_MASS_UNITS = ["oz", "g", "lb", "kg"];
const HOP_MASS_KEY = "hop.mass";

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

function resolveOrNull(engine, path) {
  try {
    return engine.resolve(path);
  } catch (err) {
    reportError("hops.resolve", err);
    return null;
  }
}

export function registerHopCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "hop",
    Cap: "Hop",
    nodeId: N.collection,
    seedKey: "hops",
    idField: "hop_id", allowDuplicates: true,
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
      if (app.whirlpoolHopCatalogForm === "t90_pellet") {
        return Object.values(ctx.cache.seeds.hops ?? {});
      }
      return Object.values(ctx.cache.seeds.hopProducts ?? {}).filter(
        (item) => item.product_form === app.whirlpoolHopCatalogForm
      );
    },
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id", allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (hop) => makeWhirlpoolRow(hop, WHIRLPOOL_ROW_DEFAULTS),
    maxVisible: MAX_VISIBLE,
    itemMeta: (item) => [
      item.product_form ? item.brand ?? "Product" : item.purpose || "Hop",
      isFiniteNumber(item.alpha_acid_pct)
        ? `${formatPercent(item.alpha_acid_pct)} alpha`
        : "alpha n/a",
      item.product_form ? item.manufacturer : item.origin,
    ],
  });

  const { engine, artifact, ui } = ctx;

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

  Object.assign(app, {
    hopRows: [],
    whirlpoolHopRows: [],
    boilHopMassKg: null,
    whirlpoolHopMassKg: null,
    hopBoundaryTotalMassKg: null,
    whirlpoolHopForms: WHIRLPOOL_HOP_FORMS,
    whirlpoolHopCatalogForm: "t90_pellet",
    whirlpoolHelpOpen: false,

    setWhirlpoolHopCatalogForm(value) {
      this.whirlpoolHopCatalogForm = value;
      this.whirlpoolHopSearch = "";
      this.whirlpoolHopCategoryFilter = [];
    },

    toggleWhirlpoolHelp() {
      this.whirlpoolHelpOpen = !this.whirlpoolHelpOpen;
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
      return hopFormLabel(row);
    },

    hopAlpha(row) {
      return hopAlphaLabel(row);
    },

    hopAlphaInput(row) {
      return hopAlphaInputValue(row);
    },

    hopAlphaRange(row) {
      return hopAlphaStockLabel(ctx.cache.references.hop?.[row?.hop_id]);
    },

    hopAlphaOutsideStock(row) {
      return hopAlphaIsOutsideStock(row, ctx.cache.references.hop?.[row?.hop_id]);
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
      return hopBoilPctLabel(row);
    },

    hopMinutes(row) {
      return hopMinutesLabel(row);
    },

    hopTemp(row) {
      return formatTemp(row?.initial_temp_c);
    },

    hopIbu(row) {
      return hopIbuLabel(row);
    },

    hopPct(row) {
      return hopPctLabel(row);
    },
  });

  Object.defineProperties(app, {
    hopMassUnit: {
      configurable: true,
      get() {
        return this.unitMode?.[HOP_MASS_KEY] ?? this.unitMode?.mass ?? "g";
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
        if (typeof this.boilHopMassKg === "number" && Number.isFinite(this.boilHopMassKg)) {
          return formatMass(this.boilHopMassKg, this.hopMassUnit);
        }
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
        if (
          typeof this.hopBoundaryTotalMassKg === "number" &&
          Number.isFinite(this.hopBoundaryTotalMassKg)
        ) {
          return this.hopBoundaryTotalMassKg;
        }
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
        if (!rows.length) return "";
        if (
          typeof this.hopBoundaryTotalMassKg === "number" &&
          Number.isFinite(this.hopBoundaryTotalMassKg)
        ) {
          return formatMass(this.hopBoundaryTotalMassKg, this.hopMassUnit);
        }
        const masses = rows
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return "—";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
    whirlpoolHopTotalMassDisplay: {
      configurable: true,
      get() {
        if (
          typeof this.whirlpoolHopMassKg === "number" &&
          Number.isFinite(this.whirlpoolHopMassKg)
        ) {
          return formatMass(this.whirlpoolHopMassKg, this.hopMassUnit);
        }
        const rows = this.whirlpoolHopRows ?? [];
        const masses = rows
          .map((r) => r.mass_kg)
          .filter((m) => typeof m === "number" && Number.isFinite(m));
        if (!masses.length) return rows.length ? "—" : "";
        return formatMass(masses.reduce((sum, m) => sum + m, 0), this.hopMassUnit);
      },
    },
    ...whirlpoolPolicyDescriptors({
      notes: ctx.cache?.seeds?.whirlpoolNotes ?? {},
      formatTemp,
      formatNumber: formatWithDecimals,
      utilizationFor: productFormUtilization,
    }),
    ...whirlpoolTimelineDescriptors({
      formatTemp,
      formatNumber: formatWithDecimals,
      batchCurve: () => {
        const ambient = resolveOrNull(engine, N.whirlpoolAmbient);
        const timeConstant = resolveOrNull(engine, N.whirlpoolCoolingTimeConstant);
        if (!isFiniteNumber(ambient) || !isFiniteNumber(timeConstant) || timeConstant <= 0) {
          return null;
        }
        return { ambientTempC: ambient, kPerMin: 1 / timeConstant };
      },
      reportError,
      timelineFor: whirlpoolTimeline,
    }),
  });

  for (const [key, id] of Object.entries({
    boilIbuField: N.boilIbu,
    whirlpoolIbuField: N.whirlpoolIbu,
    totalIbuField: N.totalIbu,
    whirlpoolAmbientField: N.whirlpoolAmbient,
    whirlpoolCoolingField: N.whirlpoolCoolingTimeConstant,
  })) {
    Object.defineProperty(app, key, {
      configurable: true,
      get() {
        return (this.fieldsBySlice[N.slice] ?? []).find((field) => field.id === id) ?? null;
      },
    });
  }
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
  app.boilHopMassKg = resolveOrNull(engine, N.boilMass);
  app.whirlpoolHopMassKg = resolveOrNull(engine, N.whirlpoolMass);
  app.hopBoundaryTotalMassKg = resolveOrNull(engine, N.totalMass);
}

export const KEYS = [
  ...catalogDraftKeys("hop", "Hop"),
  ...catalogDraftKeys("whirlpoolHop", "WhirlpoolHop"),
  "hopRows",
  "whirlpoolHopRows",
  "boilHopMassKg",
  "whirlpoolHopMassKg",
  "hopBoundaryTotalMassKg",
  "hopMassUnit",
  "whirlpoolHopForms",
  "whirlpoolHopCatalogForm",
  "setWhirlpoolHopCatalogForm",
  "whirlpoolHelpOpen",
  "toggleWhirlpoolHelp",
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
  "whirlpoolStartBands",
  "whirlpoolStartBandValue",
  "whirlpoolStartBandHint",
  "setWhirlpoolStartBand",
  "whirlpoolHopTemperatureWarning",
  "whirlpoolTimelineState",
  "whirlpoolInferredChills",
  "whirlpoolZeroRestNote",
];
