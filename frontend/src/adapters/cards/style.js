// Style card composition root: four installers behind one card, each owning its
// own app members and KEYS — the sealed declaration, the fermentation-target
// navigator, the target sliders, and style conformance. The picker and envelope
// are read-only (the batch's style is its identity); the region math lives in
// engine/fermentation.js and the plot projection in views/producer/stylePlot.js.

import { registerStyleDeclaration, refreshStyleDeclaration } from "./style/declaration.js";
import { registerStyleNavigator, refreshStyleNavigator } from "./style/navigator.js";
import { registerStyleTargets, refreshStyleTargets } from "./style/targets.js";
import { registerStyleConformance } from "./style/conformance.js";

export function registerStyleCard(app, ctx) {
  registerStyleDeclaration(app, ctx);
  registerStyleNavigator(app, ctx);
  registerStyleTargets(app, ctx);
  registerStyleConformance(app, ctx);
}

export function refreshStyleCard(app, ctx) {
  refreshStyleDeclaration(app, ctx);
  refreshStyleNavigator(app, ctx);
  refreshStyleTargets(app, ctx);
}
