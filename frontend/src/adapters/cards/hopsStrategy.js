export function installHopStrategy(app) {
  Object.assign(app, {
    hopStrategy: "",
    setHopStrategy(value) {
      this.hopStrategy = typeof value === "string" ? value : "";
      this.notify();
    },
  });
}

export const KEYS = ["hopStrategy", "setHopStrategy"];
