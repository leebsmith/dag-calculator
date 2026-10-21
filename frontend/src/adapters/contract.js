// Declared installer contract: each `install*`/`register*` module exports the
// app members it assigns so collisions between installers are detectable
// instead of silently clobbering shared reactive state.

/**
 * Assert that no two installers assign the same app member. Dev-only guard:
 * the single reactive root is a deliberate Alpine requirement, so the fix for a
 * collision is renaming, never splitting the object.
 *
 * @param {Array<{ name: string, keys: string[] }>} installers
 */
export function assertNoCollisions(installers) {
  const seen = new Map();
  for (const { name, keys } of installers) {
    for (const key of keys) {
      const existing = seen.get(key);
      if (existing) {
        throw new Error(`installer collision: "${key}" assigned by both ${existing} and ${name}`);
      }
      seen.set(key, name);
    }
  }
}
