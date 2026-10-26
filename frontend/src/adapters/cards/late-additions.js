// Late sugar additions card: definite-mass rows dosed from the sugar catalog.
// Uses the shared catalog/draft helper; bespoke bits are the summary readouts.

import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import { sugarEffect } from "../../views/producer/sugarEffect.js";
import {
  MAX_SUGAR_SHARE,
  resolvedSugarMasses,
  sugarPartsFromDose,
  sugarShareFromDose,
} from "../../views/producer/sugarAllocation.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { reportError } from "../../observability.js";
import {
  formatGravity,
  formatPercent,
  formatPercentRounded,
  formatValueWithUnit,
  formatWithDecimals,
  resultCounter,
} from "../../utils.js";


function makeRow(sugar) {
  return {
    sugar_id: sugar.id,
    name: sugar.name,
    mass_kg: 0,
    parts: 0,
    resolved_mass_kg: 0,
    yield_fraction: sugar.yield_fraction,
    yield_basis: sugar.yield_basis,
    yield_provenance: sugar.yield_provenance,
    fermentability_fraction: sugar.fermentability_fraction,
    fermentability_provenance: sugar.fermentability_provenance,
    fermentability_basis: sugar.fermentability_basis,
    fermentability_method: sugar.fermentability_method,
    color_lovibond: sugar.color_lovibond,
    notes: sugar.notes,
  };
}

function numberAt(engine, path, fallback = 0) {
  try {
    const value = engine.resolve(path);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  } catch (err) {
    reportError("lateAdditions.number", err);
    return fallback;
  }
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

const SCALE_PINS = [
  { value: "abv", label: "ABV" },
  { value: "og", label: "OG" },
  { value: "fg", label: "FG" },
];

function envelopeState(value, min, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof min !== "number" ||
    typeof max !== "number"
  ) {
    return "na";
  }
  return value >= min && value <= max ? "in" : "out";
}

function envelopeClass(state) {
  if (state === "out") return "text-danger";
  if (state === "in") return "status-badge-success";
  return "";
}

// The current dose's effect at the solved pin. Every operand comes from the
// batch solve; the panel never sets a root.
function currentSugarEffect(engine) {
  const read = (path, fallback) => {
    try {
      const value = engine.resolve(path);
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    } catch (err) {
      reportError("lateAdditions.sugarEffect", err);
      return fallback;
    }
  };
  return sugarEffect({
    extractTotalKg: read(N.effect.extractTotal, 0),
    sugarExtractKg: read(N.extract, 0),
    sgPostBoil: read(N.effect.sgPostBoil, 0),
    apparentAttenuation: read(N.effect.apparentAttenuation, 0),
    gristYield: read(N.effect.gristYield, 0),
    grainMoisture: read(N.effect.grainMoisture, 0),
  });
}

// Templates bind these strings, so they are built once per refresh. A getter
// that reads the engine directly registers no Alpine dependency and never
// re-runs after its first read.
function sugarEffectDisplayOf(effect) {
  if (!effect?.active) return null;
  const signed = (value, decimals, suffix = "") =>
    `${value >= 0 ? "+" : ""}${formatWithDecimals(value, decimals)}${suffix}`;
  return {
    share: formatPercent(effect.share),
    og: signed(effect.ogPoints, 3),
    fg: "+0.000",
    abv: signed(effect.abvPoints, 2, "%"),
    grist:
      effect.gristKg == null ? "—" : `${formatWithDecimals(effect.gristKg, 2)} kg`,
  };
}

export function registerLateAdditionsCard(app, ctx) {
  installCatalogDraft(app, ctx, {
    prefix: "sugar",
    Cap: "Sugar",
    nodeId: N.collection,
    seedKey: "sugars",
    idField: "sugar_id",
    categoryField: null,
    makeRow,
    itemMeta: (item) => [
      `Yield ${formatPercentRounded(item.yield_fraction)}`,
      formatValueWithUnit(item.color_lovibond, "°L", { dash: "" }),
    ],
  });

  Object.assign(app, {
    // Rows for the read-only summary card (refreshed by refreshLateAdditionsCard).
    sugarList: [],
    latePinPanelOpen: false,
    latePinPanelSeen: false,
    latePinPanelVisible: false,
    scalePreviewRows: [],
    previewCompositionCaption: "",

    sugarField(id) {
      return (this.fieldsBySlice[N.slice] ?? []).find((f) => f.id === id) ?? null;
    },

    toggleLatePinPanel() {
      this.latePinPanelOpen = !this.latePinPanelOpen;
    },

    syncScalePreviewState() {
      let rows = [];
      try {
        const raw = ctx.engine.resolve(N.preview);
        rows = Array.isArray(raw) ? raw : [];
      } catch (err) {
        reportError("lateAdditions.scalePreviews", err);
      }
      const style = ctx.engine.identity?.style ?? {};
      const active = this.scalePin;
      this.scalePreviewRows = rows.map((row) => {
        const label =
          SCALE_PINS.find((pin) => pin.value === row.pin)?.label ?? row.pin;
        const ogState = row.ok
          ? envelopeState(row.og, style.og_min, style.og_max)
          : "out";
        const fgState = row.ok
          ? envelopeState(row.fg, style.fg_min, style.fg_max)
          : "out";
        const abvState = row.ok
          ? envelopeState(row.abv, style.abv_min, style.abv_max)
          : "out";
        return {
          pin: row.pin,
          pinLabel: label,
          active: row.pin === active,
          ok: row.ok === true,
          statusLabel: row.ok ? "" : row.reason || "unreachable",
          ogDisplay: row.ok ? formatGravity(row.og) : "—",
          fgDisplay: row.ok ? formatGravity(row.fg) : "—",
          abvDisplay: row.ok ? formatWithDecimals(row.abv, 1) : "—",
          ogClass: envelopeClass(ogState),
          fgClass: envelopeClass(fgState),
          abvClass: envelopeClass(abvState),
        };
      });

      const intent = ctx.engine.get(N.intent) ?? "dose";
      if (intent === "share") {
        const share = Number(ctx.engine.get(N.share)) || 0;
        this.previewCompositionCaption = `Previews hold ${formatPercent(share, 1)} of extract`;
      } else {
        const dose = Number(ctx.engine.get(N.dose)) || 0;
        this.previewCompositionCaption = `Previews hold ${formatWithDecimals(dose, 2)} kg sugar extract`;
      }
    },


    // Dose → share: seed the authored share and the row weights from the
    // current dose, but only on the first switch (an authored share or parts
    // round-trips untouched). The explicit adopt action forces a re-sync.
    seedShareFromDose(force = false) {
      const rows = ctx.engine.get(N.collection) ?? [];
      const currentShare = Number(ctx.engine.get(N.share)) || 0;
      const currentParts = rows.reduce((sum, row) => sum + (Number(row.parts) || 0), 0);
      if (!force && (currentShare > 0 || currentParts > 0)) return false;
      const total = numberAt(ctx.engine, N.effect.extractTotal);
      const share = sugarShareFromDose(rows, total);
      this.setRoot(N.share, Math.min(MAX_SUGAR_SHARE, share));
      const parts = sugarPartsFromDose(rows);
      ctx.engine.setCollection(
        N.collection,
        rows.map((row, index) => ({ ...row, parts: rounded(parts[index]) }))
      );
      return true;
    },

    setLateAdditionIntent(value) {
      const field = this.lateIntentField;
      if (!field || value === this.lateAdditionIntent) return;
      if (value === "share") this.seedShareFromDose(false);
      this.edit(field, value);
      this.lateAdditionIntentState = value;
    },

    // Explicit re-sync so an authored dose can overwrite the share/parts pair.
    adoptLateAdditionDose() {
      if (!this.seedShareFromDose(true)) return;
      this.scheduleSolve();
      this.notify();
    },

    // Explicit re-sync so the resolved share allocation can overwrite the dose.
    adoptLateAdditionShare() {
      const rows = ctx.engine.get(N.collection) ?? [];
      if (!rows.length) return;
      const share = Number(ctx.engine.get(N.share)) || 0;
      const intent = ctx.engine.get(N.intent) ?? "dose";
      const resolved = resolvedSugarMasses({
        rows,
        budgetKg: share * numberAt(ctx.engine, N.effect.extractTotal),
        share,
        mode: intent,
      });
      ctx.engine.setCollection(
        N.collection,
        rows.map((row, index) => {
          const mass = rounded(resolved[index]?.massKg);
          return { ...row, mass_kg: mass, resolved_mass_kg: mass };
        })
      );
      this.scheduleSolve();
      this.notify();
    },
  });

  Object.defineProperties(app, {
    lateAdditionIntentState: { configurable: true, writable: true, value: null },
    sugarEffectState: { configurable: true, writable: true, value: null },
    sugarEffectDisplayState: { configurable: true, writable: true, value: null },
    lateAdditionIntent: {
      configurable: true,
      get() {
        return this.lateAdditionIntentState ?? "dose";
      },
    },
    lateIntentField: {
      configurable: true,
      get() {
        return this.fieldsById[N.intent] ?? null;
      },
    },
    sugarShareField: {
      configurable: true,
      get() {
        return this.fieldsById[N.share] ?? null;
      },
    },
    sugarIsActive: {
      configurable: true,
      get() {
        const rows = ctx.engine.get(N.collection) ?? [];
        if (!rows.length) return false;
        const intent = ctx.engine.get(N.intent) ?? "dose";
        if (intent === "share") {
          const share = Number(ctx.engine.get(N.share)) || 0;
          return share > 0 && rows.some((row) => (Number(row.parts) || 0) > 0);
        }
        return rows.some((row) => (Number(row.mass_kg) || 0) > 0);
      },
    },
    // The live row allocation at the current solve: `resolved_mass_kg` is a
    // recorded result, never a request input.
    sugarResolvedRows: {
      configurable: true,
      get() {
        const rows = ctx.engine.get(N.collection) ?? [];
        const share = Number(ctx.engine.get(N.share)) || 0;
        const intent = ctx.engine.get(N.intent) ?? "dose";
        return resolvedSugarMasses({
          rows,
          budgetKg: share * numberAt(ctx.engine, N.effect.extractTotal),
          share,
          mode: intent,
        });
      },
    },
    lateSugarField: {
      configurable: true,
      get() {
        const field =
          (this.fieldsBySlice[N.slice] ?? []).find(
            (f) => f.control === "collection-table"
          ) ?? null;
        if (!field) return null;
        const shareMode = (ctx.engine.get(N.intent) ?? "dose") === "share";
        const columns = (field.columns ?? [])
          .filter((c) => (shareMode ? c.id !== "mass_kg" : c.id !== "resolved_mass_kg"))
          .map((c) =>
            c.id === "resolved_mass_kg" ? { ...c, label: "Mass" } : c
          );
        if (!shareMode) return { ...field, columns };
        const column = columns.find((c) => c.id === "resolved_mass_kg");
        const resolved = this.sugarResolvedRows;
        if (!column || resolved.length !== field.rows.length) return { ...field, columns };
        const nl = nonlinearFns(ctx.artifact, ctx.engine);
        return {
          ...field,
          columns,
          rows: field.rows.map((row, index) => {
            const shown = displayValue(
              ctx.artifact,
              "mass",
              column.displayUnit,
              resolved[index]?.massKg ?? 0,
              nl
            );
            return {
              ...row,
              resolved_mass_kg: formatWithDecimals(shown, column.decimals ?? 2),
            };
          }),
        };
      },
    },
    sugarMassField: {
      configurable: true,
      get() {
        return this.sugarField(N.mass);
      },
    },
    sugarColorField: {
      configurable: true,
      get() {
        return this.sugarField(N.color);
      },
    },
    lateExtractField: {
      configurable: true,
      get() {
        return this.sugarField(N.extract);
      },
    },
    sugarEffect: {
      configurable: true,
      get() {
        return this.sugarEffectState ?? sugarEffect({});
      },
    },
    sugarEffectDisplay: {
      configurable: true,
      get() {
        return this.sugarEffectDisplayState ?? null;
      },
    },
    sugarDraftMassDisplay: {
      configurable: true,
      get() {
        if (this.lateAdditionIntent !== "share") {
          return this.draftMassDisplay((r) => Number(r.mass_kg) || 0);
        }
        const share = Number(ctx.engine.get(N.share)) || 0;
        const total = numberAt(ctx.engine, N.effect.extractTotal);
        const rows = this.draftRows ?? [];
        const resolved = resolvedSugarMasses({
          rows,
          budgetKg: share * total,
          share,
          mode: "share",
        });
        const mass = resolved.reduce((sum, row) => sum + row.massKg, 0);
        const column = this.draftColumns.find((c) => c.id === "resolved_mass_kg");
        const shown = displayValue(
          ctx.artifact,
          "mass",
          column?.displayUnit,
          mass,
          nonlinearFns(ctx.artifact, ctx.engine)
        );
        return `${formatWithDecimals(shown, column?.decimals)}${column?.unit ? " " + column.unit : ""}`;
      },
    },
    sugarDraftExtractDisplay: {
      configurable: true,
      get() {
        if (this.lateAdditionIntent !== "share") {
          return this.draftMassDisplay(
            (r) => (Number(r.mass_kg) || 0) * (Number(r.yield_fraction) || 0)
          );
        }
        const column = this.draftColumns.find((c) => c.id === "mass_kg");
        const budget =
          (Number(ctx.engine.get(N.share)) || 0) *
          numberAt(ctx.engine, N.effect.extractTotal);
        const shown = displayValue(
          ctx.artifact,
          "mass",
          column?.displayUnit,
          budget,
          nonlinearFns(ctx.artifact, ctx.engine)
        );
        return `${formatWithDecimals(shown, column?.decimals)}${column?.unit ? " " + column.unit : ""}`;
      },
    },
    sugarResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.sugarVisibleCatalog.length,
          total: this.sugarFilteredCatalog.length,
          noun: "sugar",
          truncated: this.sugarCatalogTruncated,
          truncatedHint: "refine search",
        });
      },
    },
  });
}

export function refreshLateAdditionsCard(app, ctx) {
  const rows = ctx.engine.get(N.collection) ?? [];
  const effect = currentSugarEffect(ctx.engine);
  app.lateAdditionIntentState = ctx.engine.get(N.intent) ?? "dose";
  app.sugarEffectState = effect;
  app.sugarEffectDisplayState = sugarEffectDisplayOf(effect);
  app.sugarList = rows;
  app.latePinPanelVisible = app.sugarIsActive;
  const active = app.latePinPanelVisible;
  if (active && !app.latePinPanelSeen) {
    app.latePinPanelSeen = true;
    app.latePinPanelOpen = true;
  }
  if (!active) {
    app.latePinPanelSeen = false;
    app.latePinPanelOpen = false;
  }
  app.syncScalePreviewState();
  if (!rows.length) return;
  const share = Number(ctx.engine.get(N.share)) || 0;
  const total = numberAt(ctx.engine, N.effect.extractTotal);
  const resolved = resolvedSugarMasses({
    rows,
    budgetKg: share * total,
    share,
    mode: app.lateAdditionIntentState,
  });
  let changed = false;
  const next = rows.map((row, index) => {
    const mass = rounded(resolved[index]?.massKg);
    if (Math.abs((Number(row.resolved_mass_kg) || 0) - mass) > 1e-9) changed = true;
    return { ...row, resolved_mass_kg: mass };
  });
  // Recorded result, not a request input: updating the collection here cannot
  // change the next solve. No scheduleSolve/notify, so there is no feedback loop.
  if (changed) ctx.engine.setCollection(N.collection, next);
}
export const KEYS = [
  ...catalogDraftKeys("sugar", "Sugar"),
  "sugarList",
  "sugarField",
  "lateAdditionIntent",
  "lateIntentField",
  "sugarShareField",
  "sugarResolvedRows",
  "lateSugarField",
  "sugarMassField",
  "sugarColorField",
  "lateExtractField",
  "lateAdditionIntentState",
  "sugarEffect",
  "sugarEffectState",
  "sugarEffectDisplay",
  "sugarEffectDisplayState",
  "sugarDraftMassDisplay",
  "sugarDraftExtractDisplay",
  "sugarResultLabel",
  "seedShareFromDose",
  "setLateAdditionIntent",
  "adoptLateAdditionDose",
  "adoptLateAdditionShare",
  "latePinPanelOpen",
  "latePinPanelSeen",
  "toggleLatePinPanel",
  "scalePreviewRows",
  "previewCompositionCaption",
  "sugarIsActive",
  "latePinPanelVisible",
  "syncScalePreviewState",
];
