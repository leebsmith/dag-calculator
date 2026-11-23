// Hop and whirlpool editor field schemas: the two modal shells and the row
// inspector configs. Split from the hop card because hops.js is at its frozen
// file-size pin and the inspector closures are the logic being extracted.

function hopEditorShellActions() {
  return {
    hopEditorConfig() {
      const app = this;
      return {
        id: "hop-editor",
        title: "Hop Schedule Editor",
        badge: () => app.hopDraftSummary,
        badgeClass: "badge-info",
        cancel: () => app.cancelHopEditor(),
        save: () => app.saveHopEditor(),
        escape: () => app.handleHopEscape(),
      };
    },

    hopInspectorFields() {
      const app = this;
      return {
        schema: [
          { id: "hop-row-name", type: "text", label: "Hop name", modelKey: "name", default: "" },
          {
            id: "hop-row-alpha",
            type: "number",
            label: "Alpha acid (%)",
            read: () => app.fmt.toPercentValue(app.hopActiveRow.alpha_acid_pct, 1),
            min: 0,
            max: 100,
            step: 0.1,
            lazy: true,
            hint: "Override for crop-year alpha; defaults to the catalog median.",
          },
          {
            id: "hop-row-cone",
            type: "number",
            label: "Cone utilization (0–1)",
            read: () => app.hopActiveRow.cone_utilization ?? "",
            when: () => app.hopActiveRow.product_form === "whole_cone",
            min: 0,
            max: 1,
            step: 0.01,
            lazy: true,
            hint: "No source publishes it; measure it or own the assumption. The mass stays unsolved until it is set.",
          },
          {
            id: "hop-row-form",
            type: "select",
            label: "Form",
            read: () => app.hopActiveRow.product_form || "t90_pellet",
            options: app.hopForms,
            lazy: true,
          },
        ],
        onChange: (field, value) => {
          if (field.id === "hop-row-alpha") {
            return app.setMaltField(app.hopActiveIndex, "alpha_acid_pct", value, 0.01);
          }
          if (field.id === "hop-row-cone") {
            return app.patchDraftRow(app.hopActiveIndex, {
              cone_utilization: value === "" ? null : Number(value),
            });
          }
          if (field.id === "hop-row-form") {
            return app.patchDraftRow(app.hopActiveIndex, { product_form: value });
          }
          return app.setMaltField(app.hopActiveIndex, field.modelKey, value);
        },
      };
    },
  };
}

function whirlpoolHopRowActions() {
  return {
    whirlpoolHopRowNameField() {
      const app = this;
      return {
        schema: [
          {
            id: "whirlpool-hop-row-name",
            type: "text",
            label: "Hop name",
            modelKey: "name",
            default: "",
          },
        ],
        onChange: (field, value) =>
          app.setMaltField(app.whirlpoolHopActiveIndex, field.modelKey, value),
      };
    },

    whirlpoolHopRowConeField() {
      const app = this;
      return {
        schema: [
          {
            id: "whirlpool-hop-row-cone",
            type: "number",
            label: "Cone utilization (0–1)",
            read: () => app.whirlpoolHopActiveRow.cone_utilization ?? "",
            when: () => app.whirlpoolHopActiveRow.product_form === "whole_cone",
            min: 0,
            max: 1,
            step: 0.01,
            lazy: true,
            hint: "No source publishes it; measure it or own the assumption. The mass stays unsolved until it is set.",
          },
        ],
        onChange: (field, value) =>
          app.patchDraftRow(app.whirlpoolHopActiveIndex, {
            cone_utilization: value === "" ? null : Number(value),
          }),
      };
    },

    whirlpoolHopRowFormField() {
      const app = this;
      return {
        schema: [
          {
            id: "whirlpool-hop-row-form",
            type: "select",
            label: "Form",
            read: () => app.whirlpoolHopActiveRow.product_form || "t90_pellet",
            options: app.whirlpoolHopForms,
            lazy: true,
          },
        ],
        onChange: (field, value) =>
          app.patchDraftRow(app.whirlpoolHopActiveIndex, { product_form: value }),
      };
    },

  };
}

function whirlpoolHopStartActions() {
  return {
    whirlpoolHopRowStartField() {
      const app = this;
      return {
        schema: [
          {
            id: "whirlpool-hop-row-start",
            type: "select",
            label: "Start temperature",
            read: () => app.whirlpoolStartBandValue,
            options: [
              ...app.whirlpoolStartBands,
              { value: "custom", label: "Custom (edit the grid temperature)" },
            ],
            lazy: true,
            hint: () => app.whirlpoolStartBandHint,
          },
        ],
        onChange: (field, value) => app.setWhirlpoolStartBand(value),
      };
    },
  };
}

function whirlpoolHopAlphaActions() {
  return {
    whirlpoolHopRowAlphaField() {
      const app = this;
      return {
        schema: [
          {
            id: "whirlpool-hop-row-alpha",
            type: "number",
            label: "Alpha acid (%)",
            read: () => app.fmt.toPercentValue(app.whirlpoolHopActiveRow.alpha_acid_pct, 1),
            min: 0,
            max: 100,
            step: 0.1,
            lazy: true,
            hint: "Override with the lot CoA alpha; defaults to the catalog preset.",
            hints: [
              {
                text: "Weigh the lot CoA alpha; substitute at 40–50 % (Cryo) or 50–70 % (Lupomax) of T-90 by weight.",
                when: () => app.whirlpoolHopActiveRow.product_form === "lupulin_pellet",
              },
            ],
          },
        ],
        onChange: (field, value) =>
          app.setMaltField(app.whirlpoolHopActiveIndex, "alpha_acid_pct", value, 0.01),
      };
    },
  };
}

export function whirlpoolHopEditorShellActions() {
  return {
    whirlpoolHopEditorConfig() {
      const app = this;
      return {
        id: "whirlpool-hop-editor",
        title: "Whirlpool Hop Editor",
        badge: () => app.whirlpoolHopDraftSummary,
        badgeClass: "badge-info",
        cancel: () => app.cancelWhirlpoolHopEditor(),
        save: () => app.saveWhirlpoolHopEditor(),
        escape: () => app.handleWhirlpoolHopEscape(),
      };
    },
  };
}

export function hopEditorFieldActions() {
  return {
    ...hopEditorShellActions(),
    ...whirlpoolHopEditorShellActions(),
    ...whirlpoolHopRowActions(),
    ...whirlpoolHopStartActions(),
    ...whirlpoolHopAlphaActions(),
  };
}

export const MEMBER_KEYS = [
  "hopEditorConfig",
  "hopInspectorFields",
  "whirlpoolHopEditorConfig",
  "whirlpoolHopRowNameField",
  "whirlpoolHopRowConeField",
  "whirlpoolHopRowFormField",
  "whirlpoolHopRowStartField",
  "whirlpoolHopRowAlphaField",
];
