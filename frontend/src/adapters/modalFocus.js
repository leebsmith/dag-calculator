// Modal focus seam: initial focus, Tab containment, and focus return for the
// dialogs. Browser-only; a no-op outside a DOM.
//
// Dialogs are toggled with `x-show` (the effect runs on close) or `x-if` (the
// subtree is destroyed on close, so the Library calls `dialogRestore()` from its
// close handler). Only one dialog is open at a time.
//
// The environment is injectable so the containment rules can be tested without
// a browser: pass `{ document, requestAnimationFrame }` as the third argument.
// Templates call the two-argument form and get the ambient globals.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let activeContainer = null;
let activeHandler = null;
let previousFocus = null;

function resolveEnv(env) {
  if (env) return env;
  return {
    document: typeof document === "undefined" ? null : document,
    requestAnimationFrame:
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : null,
  };
}

function focusable(doc, container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === doc.activeElement
  );
}

function trapTab(doc, container, event) {
  if (event.key !== "Tab") return;
  const items = focusable(doc, container);
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && doc.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && doc.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function dialogRestore() {
  if (activeContainer && activeHandler) {
    activeContainer.removeEventListener("keydown", activeHandler);
  }
  activeContainer = null;
  activeHandler = null;
  const target = previousFocus;
  previousFocus = null;
  target?.focus?.();
}

export function dialogFocus(container, open, env) {
  const { document: doc, requestAnimationFrame: raf } = resolveEnv(env);
  if (!doc || !container) return;
  if (open) {
    if (activeContainer === container) return;
    if (activeContainer) dialogRestore();
    previousFocus = doc.activeElement;
    activeContainer = container;
    activeHandler = (event) => trapTab(doc, container, event);
    container.addEventListener("keydown", activeHandler);
    const focus = () => {
      // The dialog may have been closed before the frame ran.
      if (activeContainer === container) container.focus();
    };
    if (raf) raf(focus);
    else focus();
  } else if (activeContainer === container) {
    dialogRestore();
  }
}

export const KEYS = ["dialogFocus"];
