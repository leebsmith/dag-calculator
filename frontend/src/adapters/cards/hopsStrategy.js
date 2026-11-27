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
          label: "Hop strategy",
          labelClass: "visually-hidden",
          rows: 4,
          read: () => app.hopStrategy,
          write: (value) => app.setHopStrategy(value),
          commit: "change",
          placeholder:
            "What the hops are for: the split, the product choices, the weight ratio, the sensory objective.",
          attrs: { maxlength: 4000 },
        },
      ];
    },
  };
}

export function createHopStrategyLayers(ctx) {
  return [createHopStrategy(ctx)];
}

export const KEYS = ["hopStrategy", "setHopStrategy", "hopStrategyFields"];
