// Yeast selection card: strain picker plus the batch attenuation control.

import { displayValue, nonlinearFns } from "../../views/producer.js";
import {
  attenuationBandLabel,
  attenuationLabel,
  percentText,
  pofLabel,
  sta1Label,
  temperatureRangeLabel,
} from "../../views/producer/yeastRows.js";
import { YEAST_NODES as N } from "../../views/registry/yeast.js";
import { UNIT_SYMBOLS, masterUnit, unitDecimals } from "../../views/registry/units.js";
import { toggleFilter, unitSymbol } from "../../utils.js";
import { createYeastAttenuationDescriptors } from "./yeastAttenuation.js";
import { createYeastPickerDescriptors } from "./yeastPicker.js";

function yeastActions({ artifact, engine, getView }) {
  const nl = nonlinearFns(artifact, engine);
  return {
    selectedYeastId: "",
    yeastSearchQuery: "",
    yeastSearchNotes: false,
    yeastManufacturerFilter: "",
    yeastAttenuationFilter: "",
    yeastDiastaticusFilter: "",
    yeastPofFilter: "",
    yeastPickerOpen: false,
    selectedYeastSnapshot: null,
    attenuationEditorOpen: false,
    attenuationDraft: null,

    yeastAttenuation(y) {
      return attenuationLabel(y);
    },

    yeastPublished(y) {
      return attenuationBandLabel(y) || attenuationLabel(y);
    },

    yeastSta1(y) {
      return sta1Label(y);
    },

    yeastPof(y) {
      return pofLabel(y);
    },

    yeastTemperature(y) {
      const view = getView();
      const unitId = masterUnit(view.unitMode, "temperature") ?? "degC";
      return temperatureRangeLabel(y, {
        toDisplay: (value) => displayValue(artifact, "temperature", unitId, value, nl),
        symbol: unitSymbol(UNIT_SYMBOLS, "temperature", unitId),
        decimals: unitDecimals("temperature", unitId) ?? 1,
      });
    },

    // The picker opens on a clean slate: a narrowing left from the last visit
    // would hide the catalog the next time it is opened.
    openYeastPicker() {
      const view = getView();
      view.yeastSearchQuery = "";
      view.yeastSearchNotes = false;
      view.yeastManufacturerFilter = "";
      view.yeastAttenuationFilter = "";
      view.yeastDiastaticusFilter = "";
      view.yeastPofFilter = "";
      view.yeastPickerOpen = true;
    },

    closeYeastPicker() {
      getView().yeastPickerOpen = false;
    },

    handleYeastEscape() {
      const view = getView();
      if (view.yeastPickerOpen) view.closeYeastPicker();
    },

    // Selecting a strain records the selection and snapshot and closes the
    // picker. The batch AA is computed by the solver from the grist and cap.
    selectYeast(id) {
      const view = getView();
      view.setRoot(N.selection, id);
      view.pickSelection(N.selection, id);
      view.yeastSearchNotes = false;
      view.closeYeastPicker();
      view.scheduleSolve();
      view.notify();
    },

    clearYeastSelection() {
      const view = getView();
      view.setRoot(N.selection, "");
      view.pickSelection(N.selection, "");
      view.yeastSearchNotes = false;
      view.scheduleSolve();
      view.notify();
    },

    toggleYeastSearchNotes() {
      const view = getView();
      view.yeastSearchNotes = !view.yeastSearchNotes;
    },

    toggleYeastAttenuation(value) {
      const view = getView();
      view.yeastAttenuationFilter = toggleFilter(view.yeastAttenuationFilter, value);
    },

    toggleYeastDiastaticus(value) {
      const view = getView();
      view.yeastDiastaticusFilter = toggleFilter(view.yeastDiastaticusFilter, value);
    },

    toggleYeastPof(value) {
      const view = getView();
      view.yeastPofFilter = toggleFilter(view.yeastPofFilter, value);
    },

    // Commit the derate on blur/change, not per keystroke. Empty, invalid, or
    // out-of-range values reset to the previous value. The control is always in
    // percentage points, independent of the percentage unit menu.
    commitYeastDerate(valueOrElement) {
      const view = getView();
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const previousDisplay = view.yeastDerateDisplay;
      const value = Number(raw);
      if (raw === "" || !Number.isFinite(value) || value < 0 || value > 25) {
        if (element) element.value = previousDisplay;
        return;
      }
      view.setRoot(N.derate, value / 100);
      if (element) element.value = percentText(value / 100);
      view.scheduleSolve();
      view.notify();
    },

    yeastField(id) {
      return (getView().fieldsBySlice.yeast ?? []).find((f) => f.id === id) ?? {};
    },

    fieldValue(id) {
      return getView().fieldsById?.[id]?.value;
    },

    openAttenuationEditor() {
      const view = getView();
      if (!view.attenuationRangeValid) return;
      view.attenuationDraft = view.attenuationTargetPercent;
      view.attenuationEditorOpen = true;
    },

    closeAttenuationEditor() {
      getView().attenuationEditorOpen = false;
      getView().attenuationDraft = null;
    },

    setAttenuationDraft(raw) {
      const view = getView();
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      view.attenuationDraft = Math.min(
        view.attenuationTargetMax,
        Math.max(view.attenuationTargetMin, value)
      );
    },

    useAttenuationDraft() {
      const view = getView();
      const yeast = view.selectedYeast;
      const high = yeast?.attenuation_high_pct;
      const low = yeast?.attenuation_low_pct;
      const target = Number(view.attenuationDraft);
      if (!Number.isFinite(target) || typeof high !== "number" || typeof low !== "number") return;
      const fraction = Math.min(high, Math.max(low, target / 100));
      view.setRoot(N.derate, high - fraction);
      view.closeAttenuationEditor();
      view.scheduleSolve();
      view.notify();
    },
  };
}

export function createYeastCard(ctx) {
  const { cache, artifact, engine, getView } = ctx;
  const nl = nonlinearFns(artifact, engine);
  const actions = yeastActions(ctx);
  Object.defineProperties(actions, {
    ...createYeastPickerDescriptors({ cache, getView }),
    ...createYeastAttenuationDescriptors({ cache, artifact, nl, getView }),
  });
  return actions;
}

export function createYeastLayers(ctx) {
  return [createYeastCard(ctx)];
}

export function refreshYeastCard(app, ctx) {
  app.selectedYeastId = ctx.engine.get(N.selection) || "";
  app.selectedYeastSnapshot = ctx.engine.get(N.selectionNode) ?? null;
}

export const KEYS = ["selectedYeastId", "selectedYeastSnapshot", "yeastSearchQuery", "yeastSearchNotes", "yeastPickerOpen", "openYeastPicker", "closeYeastPicker", "handleYeastEscape", "toggleYeastSearchNotes", "yeastManufacturerFilter", "yeastAttenuationFilter", "yeastDiastaticusFilter", "yeastPofFilter", "yeastAttenuation", "yeastPublished", "yeastSta1", "yeastPof", "yeastTemperature", "selectYeast", "clearYeastSelection", "toggleYeastAttenuation", "toggleYeastDiastaticus", "toggleYeastPof", "commitYeastDerate", "yeastField", "fieldValue", "attenuationEditorOpen", "attenuationDraft", "openAttenuationEditor", "closeAttenuationEditor", "setAttenuationDraft", "useAttenuationDraft", "yeastCatalog", "yeastManufacturers", "yeastAttenuationTiers", "yeastDiastaticusTiers", "yeastPofTiers", "filteredYeasts", "visibleYeasts", "yeastResultCount", "isYeastListTruncated", "yeastResultLabel", "selectedYeast", "selectedYeastPublished", "selectedYeastMeta", "selectedYeastTemp", "selectedYeastBand", "selectedYeastSta1", "selectedYeastPof", "attenuationRange", "attenuationTargetMin", "attenuationTargetMax", "attenuationTargetPercent", "attenuationDraftPercent", "attenuationDraftLabel", "attenuationDerateDraft", "attenuationRangeValid", "attenuationUseLabel", "attenuationCapValue", "attenuationRealizedValue", "attenuationGristValue", "attenuationAboveCap", "attenuationAboveCapLabel", "attenuationAboveCapCause", "attenuationBinding", "yeastDerateDisplay"];
