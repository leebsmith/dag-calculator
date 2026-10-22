// Control-kind registry. The renderer dispatch (markup) keys off these kinds.
export const RENDERERS = {
  number: { editable: true },
  "choice-select": { editable: true },
  "selection-picker": { editable: true },
  "collection-table": { editable: true },
  readout: { editable: false },
  "readout-table": { editable: false },
  "water-target-selector": { editable: false },
};

export function rendererFor(control) {
  const renderer = RENDERERS[control];
  if (!renderer) throw new Error(`Unknown control kind "${control}"`);
  return renderer;
}
