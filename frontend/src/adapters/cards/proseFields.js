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
];
