// Lightweight error observability for swallowed exceptions. The view/engine
// seams degrade gracefully by design (a boundary/domain failure must never
// crash a render), but a silent `catch {}` removes the only signal that the
// model misbehaved. `reportError` restores that signal without changing the
// degradation semantics: each `scope:message` signature logs exactly once and
// is otherwise counted, so a recurring failure stays quiet on the console but
// remains visible via `errorCounters()`.
//
// The manager is a factory: the seen set and counters belong to the instance the
// app creates at boot, so two apps (or a test) never share failure state.

// The default reporter for pure helpers called outside an app (direct unit
// tests): it drops the signal rather than inventing shared state.
export function ignoreError() {}

/**
 * Create an isolated observability manager.
 *
 * @param {{ console?: Pick<Console, "error"> }} [options]
 * @returns {{
 *   reportError: (scope: string, err: unknown) => void,
 *   errorCounters: () => Record<string, number>,
 *   reset: () => void,
 * }}
 */
export function createObservabilityManager({ console: consoleImpl = console } = {}) {
  const seen = new Set();
  const counters = new Map();

  function reportError(scope, err) {
    const message = err instanceof Error ? err.message : String(err);
    const signature = `${scope}: ${message}`;
    counters.set(signature, (counters.get(signature) ?? 0) + 1);
    if (!seen.has(signature)) {
      seen.add(signature);
      consoleImpl.error(`[${scope}]`, err);
    }
  }

  function errorCounters() {
    return Object.fromEntries(counters);
  }

  function reset() {
    seen.clear();
    counters.clear();
  }

  return { reportError, errorCounters, reset };
}

/**
 * App-level factories must receive the app's manager. The self-created default
 * remains for standalone unit tests; a DEV app that forgets the injection throws
 * instead of hiding its counters.
 *
 * @param {object|undefined|null} observability
 * @param {string} scope
 * @returns {object}
 */
export function requireObservability(observability, scope) {
  if (observability) return observability;
  if (import.meta.env?.DEV) {
    throw new Error(`${scope}: observability manager was not injected`);
  }
  return createObservabilityManager();
}
