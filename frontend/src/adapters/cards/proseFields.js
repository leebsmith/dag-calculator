export function proseFieldsFromState(state) {
  return {
    hopStrategy: state?.hop_strategy,
    discussion: state?.discussion ?? "",
    fermentationStrategy: state?.fermentation_strategy ?? "",
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
    discussionFields() {
      const app = this;
      return [
        {
          id: "discussion",
          type: "textarea",
          label: "Discussion",
          rows: 12,
          read: () => app.discussion,
          write: (value) => app.setDiscussion(value),
          commit: "change",
          placeholder:
            "Where this recipe came from, what you changed, and what you were aiming for.",
          attrs: { maxlength: 4000 },
          hint: "Markdown supported: paragraphs, lists, tables, emphasis, links, and code. Blank lines separate paragraphs.",
        },
      ];
    },
    fermentationStrategyFields() {
      const app = this;
      return [
        {
          id: "fermentation-strategy",
          type: "textarea",
          label: "Strategy",
          rows: 5,
          read: () => app.fermentationStrategy,
          write: (value) => app.setFermentationStrategy(value),
          commit: "change",
          placeholder:
            "Pitch rate and starter, oxygenation, temperature schedule, and the character you want from the strain.",
          attrs: { maxlength: 4000 },
          hint: "Markdown supported: paragraphs, lists, tables, emphasis, links, and code. Blank lines separate paragraphs.",
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
  "discussionFields",
  "fermentationStrategyFields",
];
