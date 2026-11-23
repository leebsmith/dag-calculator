// Style card field schemas: the scale-pin selector, the bounded SRM/IBU
// sliders, the whirlpool split and the read-only style envelope. Kept out of
// targets.js so the schema objects (and the shared range builder) have room,
// and so templates bind one member call instead of inline JavaScript.

import { formatRange, formatWithDecimals } from "../../../utils.js";

function targetRangeField(app, options) {
  return {
    id: options.id,
    type: "range",
    label: options.label,
    min: () => options.bounds()?.[0],
    max: () => options.bounds()?.[1],
    step: options.step,
    when: () => Boolean(options.bounds()),
    read: () => options.read(),
    write: (value) => options.write(value),
    commit: "input",
    readout: () => options.readout(),
    hint: () => options.hint(),
    badge: () => {
      const provenance = options.provenance();
      return provenance.showSeed ? { text: "seed", title: provenance.seedTitle } : null;
    },
    reset: () => {
      const provenance = options.provenance();
      return {
        show: provenance.showReset,
        title: provenance.resetTitle,
        run: () => app.resetField(options.resetField()),
      };
    },
    warning: () => (options.outside() ? options.note() : null),
  };
}

function scalePinActions() {
  return {
    styleScalePinFields() {
      const app = this;
      return [
        {
          id: "style-scale-pin",
          type: "select",
          label: "Scale pin",
          read: () => app.scalePin,
          write: (value) => app.setScalePin(value),
          options: () => app.scalePinOptions,
          commit: "change",
        },
      ];
    },

  };
}

function sliderActions() {
  return {
    styleSrmFields() {
      const app = this;
      return [
        targetRangeField(app, {
          id: "target-srm",
          label: "Target SRM",
          bounds: () => app.styleSrmSliderBounds,
          step: 0.5,
          read: () => app.targetSrm,
          write: (value) => app.setTargetSrm(value),
          readout: () => app.srmTargetDisplay,
          hint: () => app.styleSrmHint,
          provenance: () => app.srmTargetProvenance,
          resetField: () => app.srmTargetField,
          outside: () => app.srmTargetOutside,
          note: () => app.srmTargetNote,
        }),
      ];
    },

    styleIbuFields() {
      const app = this;
      return [
        targetRangeField(app, {
          id: "target-ibu",
          label: "Target IBU",
          bounds: () => app.styleIbuSliderBounds,
          step: 1,
          read: () => app.targetIbu,
          write: (value) => app.setTargetIbu(value),
          readout: () => formatWithDecimals(app.targetIbu, 1) + " IBU",
          hint: () =>
            app.styleIbuBounds
              ? "Style " + formatRange(app.styleIbuBounds[0], app.styleIbuBounds[1]) + " IBU"
              : "",
          provenance: () => app.ibuTargetProvenance,
          resetField: () => app.ibuTargetField,
          outside: () => app.ibuTargetOutside,
          note: () => app.ibuTargetNote,
        }),
      ];
    },

    whirlpoolFractionFields() {
      const app = this;
      return [
        {
          id: "whirlpool-fraction",
          type: "range",
          label: "Bitterness allocation",
          min: 0,
          max: 1,
          step: 0.01,
          read: () => app.whirlpoolFraction,
          write: (value) => app.setWhirlpoolFraction(value),
          commit: "input",
          readout: () =>
            "Boil " +
            app.boilIbuDisplay +
            " IBU · " +
            app.whirlpoolPctDisplay +
            "% whirlpool · " +
            app.whirlpoolIbuDisplay +
            " IBU",
          hint: "Left = all boil-kettle; right = all whirlpool.",
        },
      ];
    },

  };
}

export function styleTargetFieldActions() {
  return {
    ...scalePinActions(),
    ...sliderActions(),
  };
}
