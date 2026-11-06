export function createHopStrategy({ getView }) {
  return {
    hopStrategy: "",
    setHopStrategy(value) {
      getView().hopStrategy = typeof value === "string" ? value : "";
      getView().notify();
    },
  };
}

export function installHopStrategy(app, dependencies = {}) {
  Object.assign(
    app,
    createHopStrategy({ ...dependencies, getView: dependencies.getView ?? (() => app) })
  );
}

export const KEYS = ["hopStrategy", "setHopStrategy"];
