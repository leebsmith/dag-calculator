import test from "node:test";
import assert from "node:assert/strict";

import { createDrawerActions, notePreview } from "../../frontend/src/adapters/drawer.js";

function install({ activeElement = null } = {}) {
  const view = {};
  const documentRef = { activeElement };
  const actions = createDrawerActions({
    getView: () => view,
    documentRef,
    isEditorActive: () => true,
  });
  Object.defineProperties(view, Object.getOwnPropertyDescriptors(actions));
  return { view, actions, documentRef };
}

function key(name, target = null) {
  return { key: name, target, preventDefault() {} };
}

test("the drawer opens on a tab and remembers the focus it took", () => {
  const button = { focused: false, focus() { this.focused = true; } };
  const { view } = install({ activeElement: button });

  view.openDrawer("notes");
  assert.equal(view.drawerOpen, true);
  assert.equal(view.drawerTab, "notes");

  view.closeDrawer();
  assert.equal(view.drawerOpen, false);
  assert.equal(button.focused, true, "focus returns to the opener");
});

test("a second press of the same key closes the drawer", () => {
  const { view } = install();
  view.drawerKey(key("n"));
  assert.equal(view.drawerTab, "notes");
  view.drawerKey(key("n"));
  assert.equal(view.drawerOpen, false);

  view.drawerKey(key("c"));
  assert.equal(view.drawerOpen, true);
  assert.equal(view.drawerTab, "checklist");
});

test("shortcuts stand down inside a field", () => {
  const { view } = install();
  const field = { closest: () => ({}) };
  view.drawerKey(key("n", field));
  assert.equal(view.drawerOpen, false);
});

test("escape closes an open drawer and does nothing when closed", () => {
  const { view } = install();
  view.openDrawer("checklist");
  view.drawerKey(key("Escape"));
  assert.equal(view.drawerOpen, false);
  view.drawerKey(key("Escape"));
  assert.equal(view.drawerOpen, false);
});

test("the drawer title follows the open tab", () => {
  const { view } = install();
  view.openDrawer("notes");
  assert.equal(view.drawerTitle, "Notes");
  view.openDrawer("checklist");
  assert.equal(view.drawerTitle, "Checklist");
});

test("the checklist badge counts noted and skipped rows", () => {
  const view = {
    engine: {
      get: () => [
        { step_id: "a", note: "done", skipped: false },
        { step_id: "b", note: "", skipped: true },
        { step_id: "c", note: "", skipped: false },
      ],
    },
  };
  const actions = createDrawerActions({ getView: () => view });
  assert.equal(actions.drawerProgress, "2/3");
});

test("an unknown tab is ignored", () => {
  const { view } = install();
  view.openDrawer("nowhere");
  assert.equal(view.drawerOpen, false);
});

test("a note preview is one line of prose or the word Empty", () => {
  assert.equal(notePreview(""), "Empty");
  assert.equal(notePreview("   \n  "), "Empty");
  assert.equal(notePreview("## Heading\n\nSome **bold** text."), "Heading Some bold text.");
  assert.equal(notePreview("dry-hop the pale ale"), "dry-hop the pale ale");
  assert.equal(notePreview("- one\n- two"), "one two");
  const long = "x".repeat(120);
  assert.equal(notePreview(long).length, 80);
  assert.ok(notePreview(long).endsWith("…"));
});
