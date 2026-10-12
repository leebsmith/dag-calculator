// Ephemeral UI state — never domain values. Holds view concerns only:
// active step, unit mode (per dimension), modal/panel flags.
export function createUiStore() {
  return {
    activeStep: "mash",
    unitMode: {}, // dimension id -> preferred unit id (display only)
  };
}
