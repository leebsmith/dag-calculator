// Runs before the stylesheet paints. Keep the key in sync with
// frontend/src/store/theme.js; tests/guards/theme-tokens.test.js checks it.
(() => {
  try {
    const mode = localStorage.getItem("brew_theme");
    if (mode === "light" || mode === "dark" || mode === "system") {
      document.documentElement.dataset.theme = mode;
    }
  } catch {
    /* storage unavailable; system mode applies */
  }
})();
