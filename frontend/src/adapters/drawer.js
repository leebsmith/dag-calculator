// Drawer actions: one open tab at a time, keyboard shortcuts (N, C, Esc), and the
// focus return the plan requires. The DOM seam is thin and injectable so the
// behaviour is testable without a browser.

import { drawerTabs } from "../views/drawer.js";

const EDITABLE = "input, select, textarea, [contenteditable]";

export function createDrawerActions({
  getView,
  observability = null,
  isEditorActive = () => true,
  documentRef = globalThis.document,
  tabs = drawerTabs,
}) {
  let focusReturn = null;

  function openDrawer(tab) {
    if (!tabs.some((entry) => entry.id === tab)) return;
    const view = getView();
    if (!view.drawerOpen) focusReturn = documentRef?.activeElement ?? null;
    view.drawerTab = tab;
    view.drawerOpen = true;
  }

  function closeDrawer() {
    const view = getView();
    if (!view.drawerOpen) return;
    view.drawerOpen = false;
    focusReturn?.focus?.({ preventScroll: true });
    focusReturn = null;
  }

  function toggleDrawer(tab) {
    const view = getView();
    if (view.drawerOpen && view.drawerTab === tab) closeDrawer();
    else openDrawer(tab);
  }

  function drawerKey(event) {
    if (!isEditorActive()) return;
    if (event?.target?.closest?.(EDITABLE)) return;
    const view = getView();
    if (event?.key === "Escape") {
      if (view.drawerOpen) closeDrawer();
      return;
    }
    const tab = tabs.find((entry) => entry.key === event?.key?.toLowerCase());
    if (!tab) return;
    event.preventDefault?.();
    toggleDrawer(tab.id);
  }

  function checklistRows() {
    try {
      return getView().engine.get("batch.brew_checklist") ?? [];
    } catch (err) {
      observability?.reportError("drawer.checklist", err);
      return [];
    }
  }

  return {
    drawerTabs: tabs,
    drawerOpen: false,
    drawerTab: "notes",
    openDrawer,
    closeDrawer,
    toggleDrawer,
    drawerKey,
    get drawerTitle() {
      const active = tabs.find((entry) => entry.id === getView().drawerTab);
      return active?.title ?? "";
    },
    get drawerProgress() {
      const rows = checklistRows();
      const done = rows.filter((row) => row.skipped === true || String(row.note ?? "").trim() !== "");
      return `${done.length}/${rows.length}`;
    },
  };
}

export const KEYS = [
  "drawerTabs",
  "drawerOpen",
  "drawerTab",
  "openDrawer",
  "closeDrawer",
  "toggleDrawer",
  "drawerKey",
  "drawerTitle",
  "drawerProgress",
];
