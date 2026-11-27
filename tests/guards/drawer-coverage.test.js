import test from "node:test";
import assert from "node:assert/strict";

import { drawer } from "../../frontend/src/views/fieldsets.js";
import { drawerTabs, notes } from "../../frontend/src/views/drawer.js";
import { read } from "./util.js";

const DRAWER = "frontend/src/partials/wall-drawer.html";

test("the notes sections are exactly the drawer-homed prose fields", () => {
  assert.deepEqual(
    notes.map((section) => section.id).sort(),
    [...drawer].filter((id) => id !== "batch.checklist_level" && id !== "batch.brew_checklist").sort()
  );
});

test("the tabs carry the N and C shortcuts", () => {
  assert.deepEqual(
    drawerTabs.map((tab) => [tab.id, tab.key]),
    [
      ["notes", "n"],
      ["checklist", "c"],
    ]
  );
});

test("the drawer renders the four notes schemas and the checklist surface", () => {
  const markup = read(DRAWER);
  for (const section of notes) {
    assert.match(markup, new RegExp(`data-schema="${section.schema}"`), section.schema);
    assert.match(markup, new RegExp(`proseIssues\\(${section.prose}\\)`), section.prose);
  }
  assert.match(markup, /<load src="src\/partials\/step-brew-day.html" \/>/);
  assert.match(markup, /x-text="drawerProgress"/);
  assert.match(markup, /@click="closeDrawer\(\)"/);
});
