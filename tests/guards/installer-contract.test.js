import test from "node:test";
import assert from "node:assert/strict";

import { assertNoCollisions } from "../../frontend/src/adapters/contract.js";
import { KEYS as navigationKeys } from "../../frontend/src/adapters/navigation.js";
import { KEYS as fieldActionsKeys } from "../../frontend/src/adapters/fieldActions.js";
import { KEYS as draftEditorKeys } from "../../frontend/src/adapters/draftEditor.js";
import { KEYS as unitActionsKeys } from "../../frontend/src/adapters/unitActions.js";
import { KEYS as snapshotKeys } from "../../frontend/src/store/snapshot.js";
import { KEYS as libraryUiKeys } from "../../frontend/src/adapters/libraryUi.js";
import { KEYS as yeastKeys } from "../../frontend/src/adapters/cards/yeast.js";
import { KEYS as styleKeys } from "../../frontend/src/adapters/cards/style.js";
import { KEYS as hopKeys } from "../../frontend/src/adapters/cards/hops.js";
import { KEYS as lateAdditionsKeys } from "../../frontend/src/adapters/cards/late-additions.js";
import { KEYS as traceMaltsKeys } from "../../frontend/src/adapters/cards/trace-malts.js";
import { KEYS as maltKeys } from "../../frontend/src/adapters/cards/malt.js";
import { KEYS as mashKeys } from "../../frontend/src/adapters/cards/mash.js";
import { KEYS as brewDayKeys } from "../../frontend/src/adapters/cards/brew-day.js";

const INSTALLERS = [
  { name: "navigation", keys: navigationKeys },
  { name: "fieldActions", keys: fieldActionsKeys },
  { name: "draftEditor", keys: draftEditorKeys },
  { name: "unitActions", keys: unitActionsKeys },
  { name: "snapshot", keys: snapshotKeys },
  { name: "libraryUi", keys: libraryUiKeys },
  { name: "yeast", keys: yeastKeys },
  { name: "style", keys: styleKeys },
  { name: "hop", keys: hopKeys },
  { name: "lateAdditions", keys: lateAdditionsKeys },
  { name: "traceMalts", keys: traceMaltsKeys },
  { name: "malt", keys: maltKeys },
  { name: "mash", keys: mashKeys },
  { name: "brewDay", keys: brewDayKeys },
];

test("every installer declares a non-empty key set", () => {
  for (const { name, keys } of INSTALLERS) {
    assert.ok(Array.isArray(keys) && keys.length > 0, `${name} KEYS is empty`);
  }
});

test("no two installers assign the same app member", () => {
  assertNoCollisions(INSTALLERS);
});

test("assertNoCollisions catches a synthetic collision", () => {
  assert.throws(() =>
    assertNoCollisions([
      { name: "a", keys: ["x", "y"] },
      { name: "b", keys: ["y"] },
    ])
  );
});
