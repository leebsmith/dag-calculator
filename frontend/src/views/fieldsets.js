// Fieldset manifest: the wall's authored regions in reading order, with the
// partial that renders each one. Stage 2 carries the current steps one-to-one so
// the step partials can bind to a scoped fieldset; Stage 3 regroups these into the
// seven decision fieldsets declared in data/fieldset-map.json.
import { steps } from "./steps.js";

export const fieldsets = steps.map((step, index) => ({
  id: step.id,
  index,
  slice: step.slice,
  title: step.title,
  subtitle: step.subtitle,
  width: "regular",
  partial: step.partial,
  fields: step.fields ?? [],
}));
