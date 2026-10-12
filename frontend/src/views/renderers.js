// Control-kind registry. The renderer dispatch (markup) keys off these kinds.
// E-a implements `number` + `readout`; `choice-select` etc. arrive in E-b/E-c.
export const RENDERERS = {
  number: { editable: true },
  "choice-select": { editable: true },
  readout: { editable: false },
};

export function rendererFor(control) {
  const renderer = RENDERERS[control];
  if (!renderer) throw new Error(`Unknown control kind "${control}"`);
  return renderer;
}
