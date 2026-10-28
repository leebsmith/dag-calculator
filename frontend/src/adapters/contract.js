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

// The app members present before the first installer runs. Non-enumerable, so
// the symbol never reaches Alpine's reactive walk or the template surface.
export const BASE_KEYS = Symbol.for("dag.installerBaseKeys");

/**
 * Compare an assembled app against its declared installer contract: every
 * member an installer added must be declared, and every declared key must
 * exist. Both directions matter — an undeclared member is invisible to the
 * collision check, and a declared key that no installer assigns is stale.
 *
 * The walk is own-property based, not enumerable-key based: a hidden getter is
 * still part of the surface, and `Object.keys` would let it escape the check.
 *
 * @param {object} app
 * @param {Array<{ name: string, keys: string[] }>} installers
 * @returns {{ undeclared: string[], missing: string[] }}
 */
export function installerSurfaceGaps(app, installers) {
  const base = new Set(app[BASE_KEYS] ?? []);
  const declared = new Set(installers.flatMap(({ keys }) => keys));
  const undeclared = Object.getOwnPropertyNames(app).filter(
    (key) => !base.has(key) && !declared.has(key)
  );
  const missing = [...declared].filter((key) => !(key in app));
  return { undeclared, missing };
}
