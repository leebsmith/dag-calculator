export function createHopStrategy({ getView }) {
  return {
    hopStrategy: "",
    setHopStrategy(value) {
      getView().hopStrategy = typeof value === "string" ? value : "";
      getView().notify();
    },
  };
}

export function createHopStrategyLayers(ctx) {
  return [createHopStrategy(ctx)];
}

export const KEYS = ["hopStrategy", "setHopStrategy"];
