// Library field edits: display and write one schema-backed record field.

import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { formatWithDecimals } from "../utils.js";
import { attenuationRangeOf } from "./libraryFields.js";

function specFor(getView, field) {
  return getView().libraryFields.find((spec) => spec.field === field) ?? null;
}

function displayValueFor(spec, value) {
  if (spec?.kind === "boolean") {
    return value === true ? "true" : value === false ? "false" : "";
  }
  if (!spec || spec.kind !== "number") return value;
  return value;
}

function displayNumber({ artifact, nl, getView, field, spec, value }) {
  if (typeof getView().inputDraft === "function") {
    const draft = getView().inputDraft(getView().inputKey("library", field), undefined);
    if (draft !== undefined) return draft;
  }
  if (!spec.unitId || spec.dimension == null) return value;
  return formatWithDecimals(
    displayValue(artifact, spec.dimension, spec.unitId, value, nl()),
    spec.decimals
  );
}

function nextValue({ artifact, nl, getView, field, spec, value }) {
  if (value === "") return undefined;
  if (spec?.kind === "boolean") {
    return value === "true" ? true : value === "false" ? false : value;
  }
  if (spec?.kind !== "number") return value;
  if (typeof getView().setInputDraft === "function") {
    getView().setInputDraft(getView().inputKey("library", field), value);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return spec.unitId && spec.dimension != null
    ? toBase(artifact, spec.dimension, spec.unitId, n, nl())
    : n;
}

export function createLibraryFieldEditor({ artifact, engine, getView }) {
  const nl = () => nonlinearFns(artifact, engine);
  return {
    libraryFieldDisplay(field) {
      const value = getView().libraryDraft?.[field];
      if (value === undefined || value === null) return "";
      const spec = specFor(getView, field);
      if (spec?.kind === "boolean") return displayValueFor(spec, value);
      if (!spec || spec.kind !== "number") return value;
      return displayNumber({ artifact, nl, getView, field, spec, value });
    },

    libraryCommitField(field) {
      if (typeof getView().clearInputDraft === "function") {
        getView().clearInputDraft(getView().inputKey("library", field));
      }
      getView().libraryDraft = { ...getView().libraryDraft };
    },

    librarySetField(field, value) {
      const view = getView();
      const spec = specFor(getView, field);
      if (field === "attenuation_cap_pct" && attenuationRangeOf(view.libraryDraft)) return;
      const next = { ...view.libraryDraft };
      const resolved = nextValue({ artifact, nl, getView, field, spec, value });
      if (resolved === undefined) delete next[field];
      else next[field] = resolved;
      if (field === "attenuation_low_pct" || field === "attenuation_high_pct") {
        const range = attenuationRangeOf(next);
        if (range) next.attenuation_cap_pct = range.high;
      }
      view.libraryDraft = next;
    },
  };
}

export const KEYS = ["libraryFieldDisplay", "libraryCommitField", "librarySetField"];
