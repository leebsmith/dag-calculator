// Style card / declaration: the sealed style readout and the envelope grid. A
// batch's style is its identity — a snapshot copied at creation — so this card
// reads the declaration; it never selects or writes one.

import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { fieldOr, formatGravity, formatGravityRange, provenanceFor } from "../../../utils.js";

// Envelope inputs, in display order, with their authored step size.
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

export function registerStyleDeclaration(app, ctx) {
  const { cache } = ctx;

  Object.assign(app, {
    selectedStyleId: "",

    styleGravity(s, field) {
      return formatGravity(s?.[field]);
    },

    styleVitals(s) {
      return `${formatGravityRange(s?.og_min, s?.og_max)} / ${formatGravityRange(
        s?.fg_min,
        s?.fg_max
      )}`;
    },
  });

  Object.defineProperties(app, {
    selectedStyle: {
      configurable: true,
      get() {
        return this.selectedStyleId ? cache.references.style[this.selectedStyleId] ?? null : null;
      },
    },
    fermentationField: {
      configurable: true,
      get() {
        return fieldOr(this.fieldsById, N.fermentation);
      },
    },
    fermentationProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.fermentationField);
      },
    },
    // Envelope editors, in display order, with resolved field models and seed
    // provenance so the template stays a dumb x-for.
    styleEnvelopeFields: {
      configurable: true,
      get() {
        return ENVELOPE_INPUTS.map(({ id, step }) => {
          const field = fieldOr(this.fieldsById, id);
          return { id, step, field, provenance: provenanceFor(field) };
        });
      },
    },
  });
}

export function refreshStyleDeclaration(app, ctx) {
  app.selectedStyleId = ctx.engine.identity?.style?.id ?? "";
}

export const KEYS = [
  "selectedStyleId",
  "selectedStyle",
  "styleGravity",
  "styleVitals",
  "fermentationField",
  "fermentationProvenance",
  "styleEnvelopeFields",
];
