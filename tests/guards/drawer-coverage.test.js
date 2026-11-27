import test from "node:test";
import assert from "node:assert/strict";

import { drawer } from "../../frontend/src/views/fieldsets.js";
import { drawerTabs, notes } from "../../frontend/src/views/drawer.js";
import { read } from "./util.js";

const DRAWER = "frontend/src/partials/wall-drawer.html";
const TRIGGER = "frontend/src/partials/drawer-trigger-section.html";

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
  assert.match(markup, /x-text="drawerTitle"/);
  assert.match(markup, /@click="closeDrawer\(\)"/);
  assert.doesNotMatch(markup, /openDrawer\(/, "the drawer does not trigger itself");

  const trigger = read(TRIGGER);
  assert.match(trigger, /x-text="drawerProgress"/);
  assert.match(trigger, /@click="toggleDrawer\('notes'\)"/);
  assert.match(trigger, /@click="toggleDrawer\('checklist'\)"/);
  assert.match(trigger, /:aria-expanded=/);
});
