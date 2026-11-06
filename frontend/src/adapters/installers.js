// Declared installer contract: each `install*`/`register*` module exports the
// app members it assigns. The single reactive root is a deliberate Alpine
// requirement; this list makes name collisions loud in development instead of
// silently clobbering shared state.
//
// This is the one authoritative list. The composition root, the contract guard,
// the ownership guard and the generated `docs/frontend-ownership.md` all read
// it, so adding an installer cannot leave a guard behind.
//
// `modules` is the source a scanner attributes `this.<member>` reads to, and
// `partials` is the card partials the installer owns: the ownership guard lets
// a partial bind its owners' members and nothing else without a `SHARED` entry.

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
import { KEYS as hopStrategyKeys } from "./cards/hopsStrategy.js";
import { KEYS as lateAdditionsKeys } from "./cards/late-additions.js";
import { KEYS as traceMaltsKeys } from "./cards/trace-malts.js";
import { KEYS as maltKeys } from "./cards/malt.js";
import { KEYS as mashKeys } from "./cards/mash.js";
import { KEYS as brewDayKeys } from "./cards/brew-day.js";
import { KEYS as dryHopKeys } from "./cards/dry-hops.js";
import { KEYS as waterKeys } from "./cards/water.js";
const NAVIGATION = ["frontend/src/adapters/navigation.js"];
const FIELD_ACTIONS = ["frontend/src/adapters/fieldActions.js"];
const DRAFT_EDITOR = ["frontend/src/adapters/draftEditor.js"];
const UNIT_ACTIONS = ["frontend/src/adapters/unitActions.js"];
const SNAPSHOT = ["frontend/src/store/snapshot.js"];
const LIBRARY_UI = [
  "frontend/src/adapters/libraryUi.js",
  "frontend/src/adapters/libraryFields.js",
  "frontend/src/adapters/libraryListEditor.js",
  "frontend/src/adapters/libraryComposition.js",
];
const YEAST = ["frontend/src/adapters/cards/yeast.js"];
const STYLE_DECLARATION = ["frontend/src/adapters/cards/style/declaration.js"];
const STYLE_NAVIGATOR = ["frontend/src/adapters/cards/style/navigator.js"];
const STYLE_TARGETS = ["frontend/src/adapters/cards/style/targets.js"];
const STYLE_CONFORMANCE = ["frontend/src/adapters/cards/style/conformance.js"];
const HOP = [
  "frontend/src/adapters/cards/hops.js",
  "frontend/src/adapters/cards/hopGetters.js",
  "frontend/src/adapters/cards/hopsCoolingCurve.js",
  "frontend/src/adapters/cards/hopsStrategy.js",
];
const CATALOG_DRAFT = [
  "frontend/src/adapters/cards/catalogDraft.js",
  "frontend/src/adapters/cards/catalogDraftGetters.js",
];
const HOP_AND_CATALOG = [...HOP, ...CATALOG_DRAFT];
const LATE_ADDITIONS = [
  "frontend/src/adapters/cards/late-additions.js",
  "frontend/src/adapters/cards/lateAdditionGetters.js",
];
const LATE_ADDITIONS_AND_CATALOG = [...LATE_ADDITIONS, ...CATALOG_DRAFT];
const TRACE_MALTS = ["frontend/src/adapters/cards/trace-malts.js"];
const TRACE_MALTS_AND_CATALOG = [...TRACE_MALTS, ...CATALOG_DRAFT];
const MALT = ["frontend/src/adapters/cards/malt.js"];
const MALT_AND_CATALOG = [...MALT, ...CATALOG_DRAFT];
const MASH = [
  "frontend/src/adapters/cards/mash.js",
  "frontend/src/adapters/cards/mashGetters.js",
];
const BREW_DAY = ["frontend/src/adapters/cards/brew-day.js"];
const DRY_HOPS = ["frontend/src/adapters/cards/dry-hops.js"];
const DRY_HOPS_AND_CATALOG = [...DRY_HOPS, ...CATALOG_DRAFT];
const WATER = [
  "frontend/src/adapters/cards/water.js",
  "frontend/src/adapters/cards/waterCardActions.js",
];
const MODAL_FOCUS = ["frontend/src/adapters/modalFocus.js"];

const STYLE_PARTIALS = ["step-style.html"];

export const INSTALLERS = [
  { name: "navigation", modules: NAVIGATION, keys: navigationKeys },
  { name: "fieldActions", modules: FIELD_ACTIONS, keys: fieldActionsKeys, partials: ["step-card.html"] },
  { name: "draftEditor", modules: DRAFT_EDITOR, keys: draftEditorKeys },
  { name: "unitActions", modules: UNIT_ACTIONS, keys: unitActionsKeys },
  { name: "snapshot", modules: SNAPSHOT, keys: snapshotKeys },
  { name: "libraryUi", modules: LIBRARY_UI, keys: libraryUiKeys },
  {
    name: "yeast",
    modules: YEAST,
    keys: yeastKeys,
    partials: ["step-yeast.html", "modal-yeast-picker.html"],
  },
  {
    name: "styleDeclaration",
    modules: STYLE_DECLARATION,
    keys: styleDeclarationKeys,
    partials: STYLE_PARTIALS,
  },
  {
    name: "styleNavigator",
    modules: STYLE_NAVIGATOR,
    keys: styleNavigatorKeys,
    partials: STYLE_PARTIALS,
  },
  { name: "styleTargets", modules: STYLE_TARGETS, keys: styleTargetsKeys, partials: STYLE_PARTIALS },
  {
    name: "styleConformance",
    modules: STYLE_CONFORMANCE,
    keys: styleConformanceKeys,
    partials: STYLE_PARTIALS,
  },
  {
    name: "hop",
    modules: HOP_AND_CATALOG,
    keys: [...hopKeys, ...hopStrategyKeys],
    partials: [
      "step-hops.html",
      "modal-hop-editor.html",
      "modal-whirlpool-hop-editor.html",
      "modal-whirlpool-cooling-ceiling.html",
    ],
  },
  {
    name: "lateAdditions",
    modules: LATE_ADDITIONS_AND_CATALOG,
    keys: lateAdditionsKeys,
    partials: ["fermentables-sugar-section.html", "modal-sugar-editor.html"],
  },
  {
    name: "traceMalts",
    modules: TRACE_MALTS_AND_CATALOG,
    keys: traceMaltsKeys,
    partials: ["step-fermentables.html", "modal-trace-malt-editor.html"],
  },
  {
    name: "malt",
    modules: MALT_AND_CATALOG,
    keys: maltKeys,
    partials: ["step-fermentables.html", "modal-malt-editor.html"],
  },
  { name: "mash", modules: MASH, keys: mashKeys, partials: ["step-mash.html", "mash-rests-modal.html"] },
  { name: "brewDay", modules: BREW_DAY, keys: brewDayKeys, partials: ["step-brew-day.html"] },
  { name: "dryHops", modules: DRY_HOPS_AND_CATALOG, keys: dryHopKeys, partials: ["hops-dry-section.html", "modal-dry-hop-editor.html"] },
  { name: "water", modules: WATER, keys: waterKeys, partials: ["step-water.html"] },
  { name: "modalFocus", modules: MODAL_FOCUS, keys: modalFocusKeys },
];

// Cross-owner reads, baselined by Phase 1 of
// `plans/archive/2026-10/alpine-maintainability-and-module-linting.md`. `owners` lists the
// installers that may read the key; the installer that declares it is implicit
// and must not be listed. Each entry carries why the read exists and fails the
// guard when no read is left, so this list is the work queue for the phases
// that move the logic into `views/`: an entry disappears with its last reader.
export const SHARED = [
  {
    key: "activeScaleTarget",
    owners: ["styleNavigator"],
    reason: "the style navigator reads the target selection the target card owns",
  },
  {
    key: "styleGravityDisplay",
    owners: ["styleTargets"],
    reason: "the pin input and its readouts print the gravity unit the navigator's plot uses",
  },
  {
    key: "addDraftRow",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "clearInputDraft",
    owners: ["styleTargets", "water"],
    reason: "shared text-input draft: every card edits a field through the one input map",
  },
  {
    key: "closeDraft",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "draftDrawer",
    owners: ["hop", "malt", "traceMalts", "dryHops"],
    reason: "the shared catalog search pane binds the drawer phase the draft editor owns",
  },
  {
    key: "colorDisplay",
    owners: ["malt", "traceMalts"],
    reason: "the malt editors reuse the draft editor's colour and field helpers",
  },
  {
    key: "colorUnit",
    owners: ["malt", "traceMalts"],
    reason: "the malt editors reuse the draft editor's colour and field helpers",
  },
  {
    key: "commitField",
    owners: ["water"],
    reason: "shared field verbs: the card partials bind the one editing surface",
  },
  {
    key: "commitNumberInput",
    owners: ["lateAdditions", "mash"],
    reason: "shared field verbs: the card partials bind the one editing surface",
  },
  {
    key: "dialogFocus",
    owners: ["hop", "lateAdditions", "malt", "mash", "traceMalts", "dryHops", "yeast"],
    reason: "every modal shares the one focus trap",
  },
  {
    key: "dismissDraftDiscard",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "draftColumns",
    owners: ["lateAdditions"],
    reason: "the sugar totals read the resolved-mass column the draft grid builds",
  },
  {
    key: "draftDirty",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "draftDiscardOpen",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "draftMassDisplay",
    owners: ["lateAdditions", "traceMalts"],
    reason: "the catalog editors bind the shared draft grid",
  },
  {
    key: "draftNodeId",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog editors bind the shared draft grid",
  },
  {
    key: "draftOpen",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog editors bind the shared draft grid",
  },
  {
    key: "draftRows",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog editors bind the shared draft grid",
  },
  {
    key: "edit",
    owners: ["hop", "lateAdditions", "water"],
    reason: "shared field verbs: the card partials bind the one editing surface",
  },
  {
    key: "editNumberInput",
    owners: ["lateAdditions", "mash"],
    reason: "shared field verbs: the card partials bind the one editing surface",
  },
  {
    key: "inputDraft",
    owners: ["lateAdditions", "mash", "styleConformance", "styleDeclaration", "styleNavigator", "styleTargets", "water"],
    reason: "shared text-input draft: every card edits a field through the one input map",
  },
  {
    key: "inputKey",
    owners: ["lateAdditions", "mash", "styleConformance", "styleDeclaration", "styleNavigator", "styleTargets", "water"],
    reason: "shared text-input draft: every card edits a field through the one input map",
  },
  {
    key: "maltCategories",
    owners: ["traceMalts"],
    reason: "the trace-malt editor lists the malt card's categories",
  },
  {
    key: "openDraft",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "openLibrary",
    owners: ["hop"],
    reason: "the whirlpool picker links to the cooling-curve library tab",
  },
  {
    key: "patchDraftRow",
    owners: ["hop", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "removeDraftRow",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "resetField",
    owners: ["styleConformance", "styleDeclaration", "styleNavigator", "styleTargets"],
    reason: "shared field verbs: the card partials bind the one editing surface",
  },
  {
    key: "resetScaleTarget",
    owners: ["styleNavigator"],
    reason: "the style navigator reads the target selection the target card owns",
  },
  {
    key: "saveDraft",
    owners: ["hop", "lateAdditions", "malt", "traceMalts", "dryHops"],
    reason: "the catalog draft mixin delegates to the shared draft editor lifecycle",
  },
  {
    key: "scalePin",
    owners: ["lateAdditions", "styleNavigator"],
    reason: "the late-addition card reads the scale pin to preview its dose",
  },
  {
    key: "scalePinLabel",
    owners: ["lateAdditions"],
    reason: "the late-addition card reads the scale pin to preview its dose",
  },
  {
    key: "selectWaterTarget",
    owners: ["fieldActions"],
    reason: "the generic card shell renders the water target selector",
  },
  {
    key: "setColorField",
    owners: ["malt", "traceMalts"],
    reason: "the malt editors reuse the draft editor's colour and field helpers",
  },
  {
    key: "setFieldUnit",
    owners: ["hop"],
    reason: "unit toggling is shared between the hop card and the generic card shell",
  },
  {
    key: "setInputDraft",
    owners: ["styleTargets", "water"],
    reason: "shared text-input draft: every card edits a field through the one input map",
  },
  {
    key: "setMaltField",
    owners: ["hop", "malt", "traceMalts"],
    reason: "the malt editors reuse the draft editor's colour and field helpers",
  },
  {
    key: "styleAbvTouched",
    owners: ["styleTargets"],
    reason: "the style target card mirrors the navigator's touched flag",
  },
  {
    key: "styleTargetInfo",
    owners: ["styleTargets"],
    reason: "the style target card mirrors the navigator's target readout",
  },
  {
    key: "updateStylePreview",
    owners: ["styleTargets"],
    reason: "a pin or target edit refreshes the navigator's cached plot model",
  },
  {
    key: "syncScalePreviewState",
    owners: ["styleTargets"],
    reason: "the style card drives the late-addition scale preview; Phase 3 extracts it",
  },
  {
    key: "toggleFieldUnit",
    owners: ["fieldActions"],
    reason: "unit toggling is shared between the hop card and the generic card shell",
  },
  {
    key: "waterTargetOptions",
    owners: ["fieldActions"],
    reason: "the generic card shell renders the water target selector",
  },
  {
    key: "waterTargetSelection",
    owners: ["fieldActions"],
    reason: "the generic card shell renders the water target selector",
  },
];
