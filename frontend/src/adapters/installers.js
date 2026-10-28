// Declared installer contract: each `install*`/`register*` module exports the
// app members it assigns. The single reactive root is a deliberate Alpine
// requirement; this list makes name collisions loud in development instead of
// silently clobbering shared state.
//
// This is the one authoritative list. The composition root and the contract
// guard both read it, so adding an installer cannot leave the guard behind.

import { KEYS as navigationKeys } from "./navigation.js";
import { KEYS as fieldActionsKeys } from "./fieldActions.js";
import { KEYS as draftEditorKeys } from "./draftEditor.js";
import { KEYS as unitActionsKeys } from "./unitActions.js";
import { KEYS as modalFocusKeys } from "./modalFocus.js";
import { KEYS as libraryUiKeys } from "./libraryUi.js";
import { KEYS as snapshotKeys } from "../store/snapshot.js";
import { KEYS as yeastKeys } from "./cards/yeast.js";
import { KEYS as styleDeclarationKeys } from "./cards/style/declaration.js";
import { KEYS as styleNavigatorKeys } from "./cards/style/navigator.js";
import { KEYS as styleTargetsKeys } from "./cards/style/targets.js";
import { KEYS as styleConformanceKeys } from "./cards/style/conformance.js";
import { KEYS as hopKeys } from "./cards/hops.js";
import { KEYS as lateAdditionsKeys } from "./cards/late-additions.js";
import { KEYS as traceMaltsKeys } from "./cards/trace-malts.js";
import { KEYS as maltKeys } from "./cards/malt.js";
import { KEYS as mashKeys } from "./cards/mash.js";
import { KEYS as brewDayKeys } from "./cards/brew-day.js";
import { KEYS as waterKeys } from "./cards/water.js";

export const INSTALLERS = [
  { name: "navigation", keys: navigationKeys },
  { name: "fieldActions", keys: fieldActionsKeys },
  { name: "draftEditor", keys: draftEditorKeys },
  { name: "unitActions", keys: unitActionsKeys },
  { name: "snapshot", keys: snapshotKeys },
  { name: "libraryUi", keys: libraryUiKeys },
  { name: "yeast", keys: yeastKeys },
  { name: "styleDeclaration", keys: styleDeclarationKeys },
  { name: "styleNavigator", keys: styleNavigatorKeys },
  { name: "styleTargets", keys: styleTargetsKeys },
  { name: "styleConformance", keys: styleConformanceKeys },
  { name: "hop", keys: hopKeys },
  { name: "lateAdditions", keys: lateAdditionsKeys },
  { name: "traceMalts", keys: traceMaltsKeys },
  { name: "malt", keys: maltKeys },
  { name: "mash", keys: mashKeys },
  { name: "brewDay", keys: brewDayKeys },
  { name: "water", keys: waterKeys },
  { name: "modalFocus", keys: modalFocusKeys },
];
