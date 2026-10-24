// Modal focus seam: initial focus, Tab containment, and focus return for the
// dialogs. Browser-only; a no-op outside a DOM.
//
// Dialogs are toggled with `x-show` (the effect runs on close) or `x-if` (the
// subtree is destroyed on close, so the Library calls `dialogRestore()` from its
// close handler). Only one dialog is open at a time.

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

function focusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

function trapTab(container, event) {
  if (event.key !== "Tab") return;
  const items = focusable(container);
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
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

export function dialogFocus(container, open) {
  if (typeof document === "undefined" || !container) return;
  if (open) {
    if (activeContainer === container) return;
    if (activeContainer) dialogRestore();
    previousFocus = document.activeElement;
    activeContainer = container;
    activeHandler = (event) => trapTab(container, event);
    container.addEventListener("keydown", activeHandler);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => container.focus());
    } else {
      container.focus();
    }
  } else if (activeContainer === container) {
    dialogRestore();
  }
}

export const KEYS = ["dialogFocus"];
