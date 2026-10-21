// Lightweight error observability for swallowed exceptions. The view/engine
// seams degrade gracefully by design (a boundary/domain failure must never
// crash a render), but a silent `catch {}` removes the only signal that the
// model misbehaved. `reportError` restores that signal without changing the
// degradation semantics: each `scope:message` signature logs exactly once and
// is otherwise counted, so a recurring failure stays quiet on the console but
// remains visible via `errorCounters()`.

const seen = new Set();
const counters = new Map();

/**
 * Record a swallowed error under a scope, logging each signature exactly once.
 *
 * @param {string} scope
 * @param {unknown} err
 * @returns {void}
 */
export function reportError(scope, err) {
  const message = err instanceof Error ? err.message : String(err);
  const signature = `${scope}: ${message}`;
  counters.set(signature, (counters.get(signature) ?? 0) + 1);
  if (!seen.has(signature)) {
    seen.add(signature);
    console.error(`[${scope}]`, err);
  }
}

/**
 * A snapshot of the per-signature failure counts (dev-facing).
 *
 * @returns {Record<string, number>}
 */
export function errorCounters() {
  return Object.fromEntries(counters);
}

/** Reset all state (test isolation). */
export function resetErrorObservability() {
  seen.clear();
  counters.clear();
}
