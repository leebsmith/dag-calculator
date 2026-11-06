// Hops card: boil additions (Tinseth) and whirlpool additions (Arrhenius
// cooling integral), both authored by IBU share.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { installCoolingCurvePicker, KEYS as coolingCurveKeys } from "./hopsCoolingCurve.js";
import { HOP_NODES as N, WHIRLPOOL_ROW_DEFAULTS } from "../../views/registry/hops.js";
import { hopSectionMetaDescriptors, hopSectionState } from "../../views/producer/hopSections.js";
import {
  hopAlphaInputValue, hopAlphaLabel, hopBoilPctLabel, hopFormLabel, hopIbuLabel,
  hopMinutesLabel, hopAdditionLabel, hopPctLabel,
  BOIL_HOP_FORMS, WHIRLPOOL_HOP_FORMS,
} from "../../views/producer/hopRows.js";
import {
  HOP_MASS_KEY, HOP_MASS_UNITS, MAX_VISIBLE,
  boilPolicyDescriptors, boilRowsFor, catalogResultLabel, combinedMassDisplay,
  createHopFormatters, draftPartsTotal, draftSummary, hopAlphaOutsideStockFor,
  hopAlphaRangeText, hopCatalogEntries, hopCatalogItemMeta, hopMassText,
  hopTempText, massTotalDisplay, massTotalKg, whirlpoolPolicyDescriptors,
  whirlpoolRowsFor, whirlpoolTimelineDescriptors,
} from "../../views/hopsLogic.js";
import { cycleUnit, formatWithDecimals } from "../../utils.js";
import { reportError } from "../../observability.js";
import { makeBoilRow } from "../../views/producer/boilPolicy.js";
import {
  makeWhirlpoolRow, readWhirlpoolCeiling, whirlpoolCeilingBadge,
} from "../../views/producer/whirlpoolPolicy.js";

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
    catalog: (a) => hopCatalogEntries(ctx.cache, a.hopCatalogForm),
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id", allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (hop, a) => makeBoilRow(hop, a.hopCatalogForm),
    maxVisible: MAX_VISIBLE,
    itemMeta: hopCatalogItemMeta,
    searchPlaceholder: "Search hops by name…",
    emptyMessage: "No matching hops found.",
    resultLabel: (a) => a.hopResultLabel,
    catalogForm: {
      options: (a) => a.hopForms,
      value: (a) => a.hopCatalogForm,
      set: (value, a) => a.setHopCatalogForm(value),
    },
    drawerId: "hop-drawer",
    toolbarNote:
      "Enter relative IBU parts; Hamilton normalizes them to 100%. Mass is derived from Tinseth.",
    addLabel: "＋ Add Hop from Catalog",
    emptyText: "No hops in the draft. Click “＋ Add Hop from Catalog”.",
    totals: (a) => ({
      label: "Total parts:",
      value: a.fmt.formatWithDecimals(a.hopDraftPartsTotal, 1),
    }),
  });

  installCatalogDraft(app, ctx, {
    prefix: "whirlpoolHop",
    Cap: "WhirlpoolHop",
    nodeId: N.whirlpoolCollection,
    seedKey: "hops",
    catalog: (a) => hopCatalogEntries(ctx.cache, a.whirlpoolHopCatalogForm),
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id", allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (hop, a) => makeWhirlpoolRow(hop, WHIRLPOOL_ROW_DEFAULTS, a.whirlpoolHopCatalogForm),
    maxVisible: MAX_VISIBLE,
    rowBadge: whirlpoolCeilingBadge,
    itemMeta: hopCatalogItemMeta,
    searchPlaceholder: "Search hops and products by name or maker…",
    emptyMessage: "No matching entries found.",
    resultLabel: (a) => a.whirlpoolHopResultLabel,
    catalogForm: {
      options: (a) => a.whirlpoolHopForms,
      value: (a) => a.whirlpoolHopCatalogForm,
      set: (value, a) => a.setWhirlpoolHopCatalogForm(value),
    },
    drawerId: "whirlpool-hop-drawer",
    toolbarNote:
      "Enter relative IBU parts; Hamilton normalizes them to 100%. Mass is derived from the whirlpool cooling integral.",
    addLabel: "＋ Add Hop from Catalog",
    emptyText: "No hops in the draft. Click “＋ Add Hop from Catalog”.",
    totals: (a) => ({
      label: "Total parts:",
      value: a.fmt.formatWithDecimals(a.whirlpoolHopDraftPartsTotal, 1),
    }),
  });

  const { engine, artifact, ui } = ctx;

  const { formatMass, formatTemp } = createHopFormatters({ artifact, engine, ui });

  Object.assign(app, {
    hopRows: [],
    whirlpoolHopRows: [],
    whirlpoolCoolingCeiling: [],
    boilHopMassKg: null,
    whirlpoolHopMassKg: null,
    hopBoundaryTotalMassKg: null,
    hopForms: BOIL_HOP_FORMS,
    hopCatalogForm: "t90_pellet",
    whirlpoolHopForms: WHIRLPOOL_HOP_FORMS,
    whirlpoolHopCatalogForm: "t90_pellet",
    whirlpoolHelpOpen: false,
    boilHopAlphaMassKg: null,
    whirlpoolHopAlphaMassKg: null,
    ...hopSectionState(),

    setHopCatalogForm(value) {
      this.hopCatalogForm = value;
      this.hopSearch = "";
      this.hopCategoryFilter = [];
    },

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
      return hopMassText(row, this.hopMassUnit, formatMass);
    },

    whirlpoolHopMass(row) {
      return hopMassText(row, this.hopMassUnit, formatMass);
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
      return hopAlphaRangeText(ctx.cache, row);
    },

    hopAlphaOutsideStock(row) {
      return hopAlphaOutsideStockFor(ctx.cache, row);
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
    hopAddition(row) {
      return hopAdditionLabel(row);
    },

    hopTemp(row) {
      return hopTempText(row, formatTemp);
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
    hopDraftPartsTotal: {
      configurable: true,
      get() {
        return draftPartsTotal(this.draftRows);
      },
    },
    hopDraftSummary: {
      configurable: true,
      get() {
        return draftSummary(this.draftRows);
      },
    },
    whirlpoolHopDraftPartsTotal: {
      configurable: true,
      get() {
        return draftPartsTotal(this.draftRows);
      },
    },
    whirlpoolHopDraftSummary: {
      configurable: true,
      get() {
        return draftSummary(this.draftRows);
      },
    },
    hopResultLabel: {
      configurable: true,
      get() {
        return catalogResultLabel({
          visible: this.hopVisibleCatalog.length,
          filtered: this.hopFilteredCatalog.length,
          truncated: this.hopCatalogTruncated,
        });
      },
    },
    whirlpoolHopResultLabel: {
      configurable: true,
      get() {
        return catalogResultLabel({
          visible: this.whirlpoolHopVisibleCatalog.length,
          filtered: this.whirlpoolHopFilteredCatalog.length,
          truncated: this.whirlpoolHopCatalogTruncated,
        });
      },
    },
    boilHopTotalMassDisplay: {
      configurable: true,
      get() {
        return massTotalDisplay({
          rows: this.hopRows,
          boundaryMassKg: this.boilHopMassKg,
          unit: this.hopMassUnit,
          formatMass,
        });
      },
    },
    hopTotalMassKg: {
      configurable: true,
      get() {
        return massTotalKg(
          [...(this.hopRows ?? []), ...(this.whirlpoolHopRows ?? [])],
          this.hopBoundaryTotalMassKg
        );
      },
    },
    hopTotalMassDisplay: {
      configurable: true,
      get() {
        return combinedMassDisplay({
          boilRows: this.hopRows,
          whirlpoolRows: this.whirlpoolHopRows,
          boundaryMassKg: this.hopBoundaryTotalMassKg,
          unit: this.hopMassUnit,
          formatMass,
        });
      },
    },
    whirlpoolHopTotalMassDisplay: {
      configurable: true,
      get() {
        return massTotalDisplay({
          rows: this.whirlpoolHopRows,
          boundaryMassKg: this.whirlpoolHopMassKg,
          unit: this.hopMassUnit,
          formatMass,
        });
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
    ...whirlpoolPolicyDescriptors({
      notes: ctx.cache?.seeds?.whirlpoolNotes ?? {},
      formatTemp,
      formatMass,
      formatNumber: formatWithDecimals,
      postBoilVolume: () => resolveOrNull(engine, N.postBoilVolume),
      whirlpoolIbu: () => Number(resolveOrNull(engine, N.whirlpoolIbu)),
      activeRow: () => app.whirlpoolHopActiveRow,
      alphaMassKg: () => app.whirlpoolHopAlphaMassKg,
    }),
    ...boilPolicyDescriptors({
      formatMass,
      formatNumber: formatWithDecimals,
      postBoilVolume: () => resolveOrNull(engine, N.postBoilVolume),
      boilIbu: () => Number(resolveOrNull(engine, N.boilIbu)),
      rows: () => app.hopRows,
      alphaMassKg: () => app.boilHopAlphaMassKg,
    }),
    ...whirlpoolTimelineDescriptors({
      formatTemp,
      formatNumber: formatWithDecimals,
      readTimeline: () => ({
        segments: resolveOrNull(engine, N.whirlpoolTimeline) ?? null,
        chills: resolveOrNull(engine, N.whirlpoolChills) ?? [],
      }),
      reportError,
      timelineState: () => app.whirlpoolTimelineState,
      rows: () => app.whirlpoolHopRows,
    }),
    ...hopSectionMetaDescriptors(),
  });

  installCoolingCurvePicker(app, ctx, { formatTemp });

  for (const [key, id] of Object.entries({
    boilIbuField: N.boilIbu,
    whirlpoolIbuField: N.whirlpoolIbu,
    totalIbuField: N.totalIbu,
    whirlpoolAmbientField: N.whirlpoolAmbient,
    whirlpoolCoolingField: N.whirlpoolCoolingTimeConstant,
    whirlpoolKnockoutField: N.whirlpoolKnockout,
    whirlpoolStartTempField: N.whirlpoolStartTemp,
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
  app.hopRows = boilRowsFor({
    rows: engine.get(N.collection),
    results: resolveOrNull(engine, N.boilRows),
    boilIbu,
    boilTimeMin,
  });
  app.whirlpoolHopRows = whirlpoolRowsFor({
    rows: engine.get(N.whirlpoolCollection),
    results: resolveOrNull(engine, N.whirlpoolRows),
    whirlpoolIbu,
    volume,
  });
  app.whirlpoolCoolingCeiling = readWhirlpoolCeiling(
    engine,
    (path) => resolveOrNull(engine, path),
    N
  );
  app.boilHopMassKg = resolveOrNull(engine, N.boilMass);
  app.whirlpoolHopMassKg = resolveOrNull(engine, N.whirlpoolMass);
  app.boilHopAlphaMassKg = resolveOrNull(engine, N.boilAlphaMass);
  app.whirlpoolHopAlphaMassKg = resolveOrNull(engine, N.whirlpoolAlphaMass);
  app.hopBoundaryTotalMassKg = resolveOrNull(engine, N.totalMass);
}

export const KEYS = [
  ...catalogDraftKeys("hop", "Hop"),
  ...catalogDraftKeys("whirlpoolHop", "WhirlpoolHop"),
  "hopRows",
  "whirlpoolHopRows",
  "whirlpoolCoolingCeiling",
  "boilHopMassKg",
  "whirlpoolHopMassKg",
  "boilHopAlphaMassKg",
  "whirlpoolHopAlphaMassKg",
  "hopBoundaryTotalMassKg",
  "hopMassUnit",
  "whirlpoolHopForms",
  "whirlpoolHopCatalogForm",
  "setWhirlpoolHopCatalogForm",
  "whirlpoolHelpOpen",
  "toggleWhirlpoolHelp",
  "hopSections",
  "toggleHopSection",
  "isHopSectionOpen",
  "boilHopSectionMeta",
  "whirlpoolHopSectionMeta",
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
  "hopAddition",
  "hopDemandLine",
  "whirlpoolHopDemandLine",
  "hopTemp",
  "hopIbu",
  "hopPct",
  "boilIbuField",
  "whirlpoolIbuField",
  "totalIbuField",
  "whirlpoolAmbientField",
  "whirlpoolCoolingField",
  "whirlpoolKnockoutField",
  "whirlpoolStartTempField",
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
  "hopDoseWarning",
  "hopForms",
  "hopCatalogForm",
  "setHopCatalogForm",
  "whirlpoolStartBands",
  "whirlpoolStartBandValue",
  "whirlpoolStartBandHint",
  "setWhirlpoolStartBand",
  "whirlpoolCeilingMinute",
  "whirlpoolCeilingTemp",
  "whirlpoolTimelineState",
  "whirlpoolInferredChills",
  "whirlpoolZeroRestNote",
  ...coolingCurveKeys,
];
