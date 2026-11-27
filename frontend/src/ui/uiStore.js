// Ephemeral UI state — never domain values. The wall owns its own scroll and
// chip cursor; this store carries only the per-dimension unit preference.
export function createUiStore() {
  return {
    unitMode: {}, // dimension id -> preferred unit id (display only)
  };
}
