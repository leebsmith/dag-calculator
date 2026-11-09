// Device-local color-theme preference. `system` follows the OS; `light` and
// `dark` override it. The pre-paint script in `frontend/public/theme-init.js`
// reads the same key before the stylesheet paints, so the first frame is right.

export const STORAGE_KEY = "brew_theme";

export const THEMES = ["system", "light", "dark"];

export function sanitizeTheme(value) {
  return THEMES.includes(value) ? value : "system";
}

export function readTheme(storage = globalThis.localStorage) {
  try {
    return sanitizeTheme(storage?.getItem(STORAGE_KEY));
  } catch {
    /* storage unavailable — system mode applies */
    return "system";
  }
}

export function applyTheme(
  mode,
  { root = globalThis.document?.documentElement, storage = globalThis.localStorage, persist = false } = {}
) {
  const safe = sanitizeTheme(mode);
  if (root) root.dataset.theme = safe;
  if (persist) {
    try {
      storage?.setItem(STORAGE_KEY, safe);
    } catch {
      /* storage unavailable (private mode / quota) — the mode still applies */
    }
  }
  return safe;
}

export function createThemeStore({ storage = globalThis.localStorage, root = globalThis.document?.documentElement } = {}) {
  const initial = readTheme(storage);
  applyTheme(initial, { root, storage, persist: false });
  return {
    mode: initial,
    set(value) {
      this.mode = applyTheme(value, { root, storage, persist: true });
    },
  };
}
