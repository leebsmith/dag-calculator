// Report-section picker schemas. The dialog binds the recipes store, so the
// field configs live beside it; the store is assembled in main.js with these
// actions merged (store/recipes.js is at its frozen file-size pin).

export function reportPickerFieldActions() {
  return {
    reportPickerConfig() {
      const app = this;
      return {
        id: "report-picker",
        variant: "plain",
        cancel: () => app.closeReportPicker(),
        escape: () => app.closeReportPicker(),
      };
    },

    reportPickerFields() {
      const app = this;
      return {
        schema: [
          {
            id: "report-sections",
            type: "checkbox-group",
            label: "Sections",
            options: () =>
              app.reportSections.map((section) => ({
                value: section.id,
                label: section.title,
              })),
            read: () => app.reportSelection,
            write: (next) => {
              app.reportSelection = next;
            },
            actions: [
              {
                label: "All",
                class: "btn-outline btn-sm",
                run: () => app.selectAllReportSections(),
              },
              {
                label: "None",
                class: "btn-outline btn-sm",
                run: () => app.clearReportSections(),
              },
            ],
          },
          {
            id: "report-mass-format",
            type: "select",
            label: "Mass format",
            read: () => app.reportMassFormat,
            write: (value) => {
              app.reportMassFormat = value;
            },
            options: () => [
              { value: "display", label: "Display units" },
              { value: "lb_oz", label: "Pounds & ounces" },
            ],
            commit: "change",
            hint: "Pounds and ounces print as 3 lb 6.4 oz (or 6.4 oz under a pound). The Purchases section always uses them, rounded up to the next ounce.",
          },
        ],
      };
    },
  };
}
