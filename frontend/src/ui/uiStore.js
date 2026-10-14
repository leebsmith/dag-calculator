// Ephemeral UI state — never domain values. Holds view concerns only:
// active step and unit mode (per dimension).
export function createUiStore() {
  return {
    activeIndex: 0, // current step cursor (index into the step manifest)
    highwater: 0, // furthest step reached (index into the step manifest)
    view: "overview", // card picker ("overview") or a focused step ("focus")
    unitMode: {}, // dimension id -> preferred unit id (display only)
  };
}
