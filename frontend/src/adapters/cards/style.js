// Style card composition root: four installers behind one card, each owning its
// own app members and KEYS — the sealed declaration, the fermentation-target
// navigator, the target sliders, and style conformance. The picker and envelope
// are read-only (the batch's style is its identity); the region math lives in
// engine/fermentation.js and the plot projection in views/producer/stylePlot.js.

import { createStyleDeclaration, refreshStyleDeclaration } from "./style/declaration.js";
import { createStyleNavigator, refreshStyleNavigator } from "./style/navigator.js";
import { createStyleTargets, refreshStyleTargets } from "./style/targets.js";
import { createStyleConformance } from "./style/conformance.js";

export function createStyleLayers(ctx) {
  return [
    createStyleDeclaration(ctx),
    createStyleNavigator(ctx),
    createStyleTargets(ctx),
    createStyleConformance(ctx),
  ];
}

export function refreshStyleCard(app, ctx) {
  refreshStyleDeclaration(app, ctx);
  refreshStyleNavigator(app, ctx);
  refreshStyleTargets(app, {
    ...ctx,
    styleTargetInfo: app.styleTargetInfo,
    styleGravityDisplay: app.styleGravityDisplay,
  });
}
