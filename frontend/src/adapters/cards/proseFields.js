export function proseFieldsFromState(state) {
  return {
    hopStrategy: state?.hop_strategy,
    discussion: state?.discussion ?? "",
    fermentationStrategy: state?.fermentation_strategy ?? "",
    processNotes: state?.process_notes ?? "",
  };
}

export function createProseFields({ getView }) {
  return {
    discussion: "",
    setDiscussion(value) {
      getView().discussion = typeof value === "string" ? value : "";
      getView().notify();
    },
    fermentationStrategy: "",
    setFermentationStrategy(value) {
      getView().fermentationStrategy = typeof value === "string" ? value : "";
      getView().notify();
    },
    processNotes: "",
    setProcessNotes(value) {
      getView().processNotes = typeof value === "string" ? value : "";
      getView().notify();
    },
    discussionFields() {
      const app = this;
      return [
        {
          id: "discussion",
          type: "textarea",
          label: "Discussion",
          labelClass: "visually-hidden",
          rows: 12,
          read: () => app.discussion,
          write: (value) => app.setDiscussion(value),
          commit: "change",
          placeholder:
            "Where this recipe came from, what you changed, and what you were aiming for.",
          attrs: { maxlength: 4000 },
        },
      ];
    },
    fermentationStrategyFields() {
      const app = this;
      return [
        {
          id: "fermentation-strategy",
          type: "textarea",
          label: "Fermentation strategy",
          labelClass: "visually-hidden",
          rows: 5,
          read: () => app.fermentationStrategy,
          write: (value) => app.setFermentationStrategy(value),
          commit: "change",
          placeholder:
            "Pitch rate and starter, oxygenation, temperature schedule, and the character you want from the strain.",
          attrs: { maxlength: 4000 },
        },
      ];
    },
    processNotesFields() {
      const app = this;
      return [
        {
          id: "process-notes",
          type: "textarea",
          label: "Process notes",
          labelClass: "visually-hidden",
          rows: 12,
          read: () => app.processNotes,
          write: (value) => app.setProcessNotes(value),
          commit: "change",
          placeholder:
            "Additions and notes the model does not calculate: peel, spices, water treatments, packaging quirks.",
          attrs: { maxlength: 4000 },
        },
      ];
    },
  };
}

export function createProseFieldsLayers(ctx) {
  return [createProseFields(ctx)];
}

export const KEYS = [
  "discussion",
  "setDiscussion",
  "fermentationStrategy",
  "setFermentationStrategy",
  "processNotes",
  "setProcessNotes",
  "discussionFields",
  "fermentationStrategyFields",
  "processNotesFields",
];
