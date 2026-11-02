# Frontend app ownership

Generated from `frontend/src/adapters/installers.js` — do not edit by hand.
Re-sync after any installer change: `node scripts/emit-ownership-index.mjs`.
The full member table is on demand: `node scripts/emit-ownership-index.mjs --full`.

- Declared members: **734** (502 enumerable, 232 hidden)
- Installers: **20**
- Card partials: **17**
- Installers reading another installer's key: **15 of 20**
- Cross-owner keys declared in `SHARED`: **48**

## Installers

| installer | modules | members | card partials | foreign reads |
|---|---|---|---|---|
| `navigation` | `frontend/src/adapters/navigation.js` | 5 | 0 | 0 |
| `fieldActions` | `frontend/src/adapters/fieldActions.js` | 27 | 1 | 5 |
| `draftEditor` | `frontend/src/adapters/draftEditor.js` | 69 | 0 | 1 |
| `unitActions` | `frontend/src/adapters/unitActions.js` | 6 | 0 | 0 |
| `snapshot` | `frontend/src/store/snapshot.js` | 7 | 0 | 1 |
| `libraryUi` | `frontend/src/adapters/libraryUi.js`, `frontend/src/adapters/libraryFields.js`, `frontend/src/adapters/libraryListEditor.js` | 50 | 0 | 4 |
| `yeast` | `frontend/src/adapters/cards/yeast.js` | 27 | 1 | 0 |
| `styleDeclaration` | `frontend/src/adapters/cards/style/declaration.js` | 7 | 1 | 3 |
| `styleNavigator` | `frontend/src/adapters/cards/style/navigator.js` | 25 | 1 | 6 |
| `styleTargets` | `frontend/src/adapters/cards/style/targets.js` | 42 | 1 | 8 |
| `styleConformance` | `frontend/src/adapters/cards/style/conformance.js` | 4 | 1 | 3 |
| `hop` | `frontend/src/adapters/cards/hops.js`, `frontend/src/adapters/cards/hopsCoolingCurve.js`, `frontend/src/adapters/cards/catalogDraft.js` | 150 | 3 | 24 |
| `lateAdditions` | `frontend/src/adapters/cards/late-additions.js`, `frontend/src/adapters/cards/catalogDraft.js` | 68 | 2 | 24 |
| `traceMalts` | `frontend/src/adapters/cards/trace-malts.js`, `frontend/src/adapters/cards/catalogDraft.js` | 44 | 2 | 25 |
| `malt` | `frontend/src/adapters/cards/malt.js`, `frontend/src/adapters/cards/catalogDraft.js` | 52 | 2 | 23 |
| `mash` | `frontend/src/adapters/cards/mash.js` | 51 | 2 | 5 |
| `brewDay` | `frontend/src/adapters/cards/brew-day.js` | 14 | 1 | 0 |
| `dryHops` | `frontend/src/adapters/cards/dry-hops.js`, `frontend/src/adapters/cards/catalogDraft.js` | 56 | 2 | 14 |
| `water` | `frontend/src/adapters/cards/water.js` | 29 | 1 | 6 |
| `modalFocus` | `frontend/src/adapters/modalFocus.js` | 1 | 0 | 0 |

## Cross-owner reads

| key | owner | readers | reason |
|---|---|---|---|
| `activeScaleTarget` | `styleTargets` | `styleNavigator` | the style navigator reads the target selection the target card owns |
| `addDraftRow` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `clearInputDraft` | `fieldActions` | `libraryUi`, `styleTargets`, `water` | shared text-input draft: every card edits a field through the one input map |
| `closeDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `colorDisplay` | `draftEditor` | `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `colorUnit` | `draftEditor` | `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `commitDraftCellInput` | `fieldActions` | `hop`, `lateAdditions`, `malt`, `traceMalts` | shared field verbs: the card partials bind the one editing surface |
| `commitField` | `fieldActions` | `water` | shared field verbs: the card partials bind the one editing surface |
| `commitNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `dialogFocus` | `modalFocus` | `hop`, `lateAdditions`, `malt`, `mash`, `traceMalts`, `dryHops` | every modal shares the one focus trap |
| `dismissDraftDiscard` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftColumns` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftDirty` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDiscardOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDisplayRows` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftDrawer` | `draftEditor` | `hop`, `malt`, `traceMalts`, `dryHops` | the shared catalog search pane binds the drawer phase the draft editor owns |
| `draftMassDisplay` | `draftEditor` | `lateAdditions`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftNodeId` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `draftOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `draftRows` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `edit` | `fieldActions` | `hop`, `lateAdditions`, `water` | shared field verbs: the card partials bind the one editing surface |
| `editDraftCell` | `draftEditor` | `fieldActions` | fieldActions drives a draft cell edit: the inverse of the shared draft grid |
| `editDraftCellInput` | `fieldActions` | `hop`, `lateAdditions`, `malt`, `traceMalts` | shared field verbs: the card partials bind the one editing surface |
| `editNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `inputDraft` | `fieldActions` | `draftEditor`, `hop`, `lateAdditions`, `libraryUi`, `malt`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `traceMalts`, `water` | shared text-input draft: every card edits a field through the one input map |
| `inputKey` | `fieldActions` | `hop`, `lateAdditions`, `libraryUi`, `malt`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `traceMalts`, `water` | shared text-input draft: every card edits a field through the one input map |
| `maltCategories` | `malt` | `traceMalts` | the trace-malt editor lists the malt card's categories |
| `openDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `openLibrary` | `libraryUi` | `hop` | the whirlpool picker links to the cooling-curve library tab |
| `patchDraftRow` | `draftEditor` | `hop`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `removeDraftRow` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `resetField` | `fieldActions` | `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets` | shared field verbs: the card partials bind the one editing surface |
| `resetScaleTarget` | `styleTargets` | `styleNavigator` | the style navigator reads the target selection the target card owns |
| `saveDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `scalePin` | `styleTargets` | `lateAdditions`, `styleNavigator` | the late-addition card reads the scale pin to preview its dose |
| `scalePinLabel` | `styleTargets` | `lateAdditions` | the late-addition card reads the scale pin to preview its dose |
| `selectWaterTarget` | `water` | `fieldActions` | the generic card shell renders the water target selector |
| `setColorField` | `draftEditor` | `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `setFieldUnit` | `unitActions` | `hop` | unit toggling is shared between the hop card and the generic card shell |
| `setInputDraft` | `fieldActions` | `libraryUi`, `styleTargets`, `water` | shared text-input draft: every card edits a field through the one input map |
| `setMaltField` | `draftEditor` | `hop`, `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `styleAbvTouched` | `styleNavigator` | `styleTargets` | the style target card mirrors the navigator's touched flag |
| `styleConformanceReport` | `styleConformance` | `snapshot` | the snapshot exports the conformance verdict captured at freeze |
| `styleTargetInfo` | `styleNavigator` | `styleTargets` | the style target card mirrors the navigator's target readout |
| `syncScalePreviewState` | `lateAdditions` | `styleTargets` | the style card drives the late-addition scale preview; Phase 3 extracts it |
| `toggleFieldUnit` | `unitActions` | `fieldActions` | unit toggling is shared between the hop card and the generic card shell |
| `waterTargetOptions` | `water` | `fieldActions` | the generic card shell renders the water target selector |
| `waterTargetSelection` | `water` | `fieldActions` | the generic card shell renders the water target selector |
