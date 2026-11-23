// Trace Malt Editor field schemas: the modal shell and the row-inspector field
// configs. Split from the card so the card stays under its function-length cap.

function traceEditorShellActions() {
  return {
    traceEditorConfig() {
      const app = this;
      return {
        id: "trace-malt-editor",
        title: "Trace Malt Editor",
        badge: () => app.traceDraftMassDisplay,
        badgeClass: "badge-info",
        cancel: () => app.cancelTraceEditor(),
        save: () => app.saveTraceEditor(),
        escape: () => app.handleTraceEscape(),
      };
    },

  };
}

function traceRowFieldActions() {
  return {
    traceRowNameField() {
      const app = this;
      return {
        schema: [
          { id: "trace-row-name", type: "text", label: "Malt name", modelKey: "name", default: "" },
        ],
        onChange: (field, value) => app.setMaltField(app.traceActiveIndex, field.modelKey, value),
      };
    },

    traceRowCategoryField() {
      const app = this;
      return {
        schema: [
          {
            id: "trace-row-category",
            type: "select",
            label: "Category",
            modelKey: "category",
            options: app.maltCategories.map((category) => ({ value: category, label: category })),
            lazy: true,
          },
        ],
        onChange: (field, value) => app.setMaltField(app.traceActiveIndex, field.modelKey, value),
      };
    },

  };
}

function traceRowNumberFieldActions() {
  return {
    traceRowYieldField() {
      const app = this;
      return {
        schema: [
          {
            id: "trace-row-yield",
            type: "number",
            label: "Extract yield (%)",
            read: () => app.fmt.toPercentValue(app.traceActiveRow.yield_fraction, 0),
            min: 0,
            max: 100,
            step: 1,
            lazy: true,
          },
        ],
        onChange: (field, value) =>
          app.setMaltField(app.traceActiveIndex, "yield_fraction", value, 0.01),
      };
    },

    traceRowColorField() {
      const app = this;
      return {
        schema: [
          {
            id: "trace-row-color",
            type: "number",
            label: () => "Color (" + app.colorUnit() + ")",
            read: () => app.colorDisplay(app.traceActiveRow.color_lovibond),
            min: 0,
            step: 0.1,
            lazy: true,
          },
        ],
        onChange: (field, value) => app.setColorField(app.traceActiveIndex, value),
      };
    },

    traceRowNotesField() {
      const app = this;
      return {
        schema: [
          {
            id: "trace-row-notes",
            type: "textarea",
            label: "Notes",
            modelKey: "notes",
            default: "",
            rows: 3,
          },
        ],
        onChange: (field, value) => app.setMaltField(app.traceActiveIndex, field.modelKey, value),
      };
    },
  };
}

export function traceEditorFieldActions() {
  return {
    ...traceEditorShellActions(),
    ...traceRowFieldActions(),
    ...traceRowNumberFieldActions(),
  };
}
