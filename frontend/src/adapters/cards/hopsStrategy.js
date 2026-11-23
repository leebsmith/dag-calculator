export function createHopStrategy({ getView }) {
  return {
    hopStrategy: "",
    setHopStrategy(value) {
      getView().hopStrategy = typeof value === "string" ? value : "";
      getView().notify();
    },
    hopStrategyFields() {
      const app = this;
      return [
        {
          id: "hop-strategy",
          type: "textarea",
          label: "Strategy",
          rows: 4,
          read: () => app.hopStrategy,
          write: (value) => app.setHopStrategy(value),
          commit: "change",
          placeholder:
            "What the hops are for: the split, the product choices, the weight ratio, the sensory objective.",
          attrs: { maxlength: 4000 },
          hint: "Markdown supported: paragraphs, lists, tables, emphasis, links, and code. Blank lines separate paragraphs.",
        },
      ];
    },
  };
}

export function createHopStrategyLayers(ctx) {
  return [createHopStrategy(ctx)];
}

export const KEYS = ["hopStrategy", "setHopStrategy", "hopStrategyFields"];
