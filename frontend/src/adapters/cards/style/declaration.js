// Style card / declaration: the sealed style readout and the envelope grid. A
// batch's style is its identity — a snapshot copied at creation — so this card
// reads the declaration; it never selects or writes one.

import { gravityDisplay } from "../../../views/producer/gravityDisplay.js";
import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { masterUnit } from "../../../views/registry/units.js";
import { fieldOr, formatWithDecimals, isFiniteNumber, provenanceFor } from "../../../utils.js";

const ENVELOPE_INPUTS = [
  { id: N.envelope.ogMin, step: "0.001" },
  { id: N.envelope.ogMax, step: "0.001" },
  { id: N.envelope.fgMin, step: "0.001" },
  { id: N.envelope.fgMax, step: "0.001" },
  { id: N.envelope.ibuMin, step: "1" },
  { id: N.envelope.ibuMax, step: "1" },
  { id: N.envelope.srmMin, step: "1" },
  { id: N.envelope.srmMax, step: "1" },
  { id: N.envelope.abvMin, step: "0.1" },
  { id: N.envelope.abvMax, step: "0.1" },
];

export function createStyleDeclaration({ cache, getView }) {
  const actions = {
    selectedStyleId: "",

    styleVitals() {
      const view = getView();
      const bounds = [
        N.envelope.ogMin,
        N.envelope.ogMax,
        N.envelope.fgMin,
        N.envelope.fgMax,
      ].map((id) => fieldOr(view.fieldsById, id).value);
      if (!bounds.every(isFiniteNumber)) return "— / —";
      const gravity = gravityDisplay(masterUnit(view.unitMode, "gravity") ?? "Plato");
      const show = (sg) => formatWithDecimals(gravity.fromSg(sg), gravity.decimals);
      const unit = gravity.symbol;
      return `${show(bounds[0])}–${show(bounds[1])} ${unit} / ${show(bounds[2])}–${show(
        bounds[3]
      )} ${unit}`;
    },
  };

  Object.defineProperties(actions, {
    selectedStyle: {
      configurable: true,
      get() {
        const view = getView();
        return view.selectedStyleId ? cache.references.style[view.selectedStyleId] ?? null : null;
      },
    },
    fermentationField: {
      configurable: true,
      get() {
        return fieldOr(getView().fieldsById, N.fermentation);
      },
    },
    fermentationProvenance: {
      configurable: true,
      get() {
        return provenanceFor(getView().fermentationField);
      },
    },
    styleEnvelopeFields: {
      configurable: true,
      get() {
        return ENVELOPE_INPUTS.map(({ id, step }) => {
          const field = fieldOr(getView().fieldsById, id);
          return { id, step, field, provenance: provenanceFor(field) };
        });
      },
    },
  });
  return actions;
}

export function refreshStyleDeclaration(app, ctx) {
  app.selectedStyleId = ctx.engine.identity?.style?.id ?? "";
}

export const KEYS = [
  "selectedStyleId",
  "selectedStyle",
  "styleVitals",
  "fermentationField",
  "fermentationProvenance",
  "styleEnvelopeFields",
];
