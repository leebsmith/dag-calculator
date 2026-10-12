// Ephemeral UI state — never domain values. Holds view concerns only:
// active step, unit mode (per dimension), modal/panel flags.
export function createUiStore() {
  return {
    activeIndex: 0, // current step cursor (index into the step manifest)
    highwater: 0, // furthest step reached (index into the step manifest)
    unitMode: {}, // dimension id -> preferred unit id (display only)
    modal: null, // e.g. "rests" | null
  };
}
