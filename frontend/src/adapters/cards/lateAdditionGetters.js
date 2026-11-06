// Late-addition card getters: intent, field lookups, and the sugar readouts.
// Every getter resolves the live view through the injected getView so the card's
// handlers and its mirrors share one seam.

import {
  columnValueLabel,
  sugarActive,
  sugarCatalogCountLabel,
  sugarTableCountLabel,
} from "../../views/producer/lateAdditionRows.js";
import { resolvedSugarMasses } from "../../views/producer/sugarAllocation.js";
import { sugarEffect } from "../../views/producer/sugarEffect.js";
import { displayValue, nonlinearFns } from "../../views/producer.js";
import { LATE_ADDITION_NODES as N } from "../../views/registry/late-additions.js";
import { reportError } from "../../observability.js";

function numberAt(engine, path, fallback = 0) {
  try {
    const value = engine.resolve(path);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  } catch (err) {
    reportError("lateAdditions.number", err);
    return fallback;
  }
}

export function stateDescriptors({ engine, getView }) {
  return {
    lateAdditionIntentState: { configurable: true, writable: true, value: null },
    sugarEffectState: { configurable: true, writable: true, value: null },
    sugarEffectDisplayState: { configurable: true, writable: true, value: null },
    lateAdditionIntent: {
      configurable: true,
      get() {
        return getView().lateAdditionIntentState ?? "dose";
      },
    },
    lateIntentField: {
      configurable: true,
      get() {
        return getView().fieldsById[N.intent] ?? null;
      },
    },
    sugarShareField: {
      configurable: true,
      get() {
        return getView().fieldsById[N.share] ?? null;
      },
    },
    sugarIsActive: {
      configurable: true,
      get() {
        return sugarActive({
          rows: engine.get(N.collection) ?? [],
          intent: engine.get(N.intent) ?? "dose",
          share: Number(engine.get(N.share)) || 0,
        });
      },
    },
    lateSugarField: {
      configurable: true,
      get() {
        // The live row allocation at the current solve: `resolved_mass_kg` is a
        // computed field, never a request input.
        const field =
          (getView().fieldsBySlice[N.slice] ?? []).find((f) => f.id === N.collection) ?? null;
        if (!field) return null;
        const shareMode = (engine.get(N.intent) ?? "dose") === "share";
        const columns = (field.columns ?? [])
          .filter((c) => (shareMode ? c.id !== "mass_kg" : c.id !== "resolved_mass_kg"))
          .map((c) => (c.id === "resolved_mass_kg" ? { ...c, label: "Mass" } : c));
        return { ...field, columns };
      },
    },
    sugarMassField: {
      configurable: true,
      get() {
        return getView().sugarField(N.mass);
      },
    },
    lateExtractField: {
      configurable: true,
      get() {
        return getView().sugarField(N.extract);
      },
    },
  };
}

export function displayDescriptors({ getView }) {
  return {
    sugarEffect: {
      configurable: true,
      get() {
        return getView().sugarEffectState ?? sugarEffect({});
      },
    },
    sugarEffectDisplay: {
      configurable: true,
      get() {
        return getView().sugarEffectDisplayState ?? null;
      },
    },
    sugarResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return sugarCatalogCountLabel({
          shown: view.sugarVisibleCatalog.length,
          total: view.sugarFilteredCatalog.length,
          truncated: view.sugarCatalogTruncated,
        });
      },
    },
    sugarCountLabel: {
      configurable: true,
      get() {
        return sugarTableCountLabel(getView().sugarList.length);
      },
    },
  };
}

export function allocationDescriptors({ engine, artifact, getView }) {
  return {
    sugarDraftMassDisplay: {
      configurable: true,
      get() {
        const view = getView();
        if (view.lateAdditionIntent !== "share") {
          return view.draftMassDisplay((r) => Number(r.mass_kg) || 0);
        }
        const share = Number(engine.get(N.share)) || 0;
        const total = numberAt(engine, N.effect.extractTotal);
        const rows = view.draftRows ?? [];
        const resolved = resolvedSugarMasses({
          rows,
          budgetKg: share * total,
          share,
          mode: "share",
        });
        const mass = resolved.reduce((sum, row) => sum + row.massKg, 0);
        const column = view.draftColumns.find((c) => c.id === "resolved_mass_kg");
        const shown = displayValue(
          artifact,
          "mass",
          column?.displayUnit,
          mass,
          nonlinearFns(artifact, engine)
        );
        return columnValueLabel(shown, column);
      },
    },
    sugarDraftExtractDisplay: {
      configurable: true,
      get() {
        const view = getView();
        if (view.lateAdditionIntent !== "share") {
          return view.draftMassDisplay(
            (r) => (Number(r.mass_kg) || 0) * (Number(r.yield_fraction) || 0)
          );
        }
        const column = view.draftColumns.find((c) => c.id === "mass_kg");
        const budget = (Number(engine.get(N.share)) || 0) * numberAt(engine, N.effect.extractTotal);
        const shown = displayValue(
          artifact,
          "mass",
          column?.displayUnit,
          budget,
          nonlinearFns(artifact, engine)
        );
        return columnValueLabel(shown, column);
      },
    },
    sugarResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return sugarCatalogCountLabel({
          shown: view.sugarVisibleCatalog.length,
          total: view.sugarFilteredCatalog.length,
          truncated: view.sugarCatalogTruncated,
        });
      },
    },
    sugarCountLabel: {
      configurable: true,
      get() {
        return sugarTableCountLabel(getView().sugarList.length);
      },
    },
  };
}
