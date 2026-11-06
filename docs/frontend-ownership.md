# Frontend app ownership

Generated from `frontend/src/adapters/installers.js` — do not edit by hand.
Re-sync after any installer change: `node scripts/emit-ownership-index.mjs`.
The full member table is on demand: `node scripts/emit-ownership-index.mjs --full`.

- Declared members: **770** (525 enumerable, 245 hidden)
- Installers: **20**
- Card partials: **19**
- Installers reading another installer's key: **16 of 20**
- Cross-owner keys declared in `SHARED`: **48**

## Installers

| installer | modules | members | card partials | foreign reads |
|---|---|---|---|---|
| `navigation` | `frontend/src/adapters/navigation.js` | 7 | 0 | 0 |
| `fieldActions` | `frontend/src/adapters/fieldActions.js` | 27 | 1 | 5 |
| `draftEditor` | `frontend/src/adapters/draftEditor.js` | 81 | 0 | 1 |
| `unitActions` | `frontend/src/adapters/unitActions.js` | 6 | 0 | 0 |
| `snapshot` | `frontend/src/store/snapshot.js` | 7 | 0 | 2 |
| `libraryUi` | `frontend/src/adapters/libraryUi.js`, `frontend/src/adapters/libraryFields.js`, `frontend/src/adapters/libraryListEditor.js`, `frontend/src/adapters/libraryComposition.js` | 55 | 0 | 4 |
| `yeast` | `frontend/src/adapters/cards/yeast.js` | 32 | 2 | 1 |
| `styleDeclaration` | `frontend/src/adapters/cards/style/declaration.js` | 6 | 1 | 3 |
| `styleNavigator` | `frontend/src/adapters/cards/style/navigator.js` | 30 | 1 | 6 |
| `styleTargets` | `frontend/src/adapters/cards/style/targets.js` | 45 | 1 | 10 |
| `styleConformance` | `frontend/src/adapters/cards/style/conformance.js` | 4 | 1 | 3 |
| `hop` | `frontend/src/adapters/cards/hops.js`, `frontend/src/adapters/cards/hopsCoolingCurve.js`, `frontend/src/adapters/cards/hopsStrategy.js`, `frontend/src/adapters/cards/catalogDraft.js` | 155 | 4 | 18 |
| `lateAdditions` | `frontend/src/adapters/cards/late-additions.js`, `frontend/src/adapters/cards/catalogDraft.js` | 68 | 2 | 21 |
| `traceMalts` | `frontend/src/adapters/cards/trace-malts.js`, `frontend/src/adapters/cards/catalogDraft.js` | 44 | 2 | 19 |
| `malt` | `frontend/src/adapters/cards/malt.js`, `frontend/src/adapters/cards/catalogDraft.js` | 52 | 2 | 17 |
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
| `commitField` | `fieldActions` | `water` | shared field verbs: the card partials bind the one editing surface |
| `commitNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `dialogFocus` | `modalFocus` | `hop`, `lateAdditions`, `malt`, `mash`, `traceMalts`, `dryHops`, `yeast` | every modal shares the one focus trap |
| `dismissDraftDiscard` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftColumns` | `draftEditor` | `lateAdditions` | the sugar totals read the resolved-mass column the draft grid builds |
| `draftDirty` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDiscardOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDrawer` | `draftEditor` | `hop`, `malt`, `traceMalts`, `dryHops` | the shared catalog search pane binds the drawer phase the draft editor owns |
| `draftMassDisplay` | `draftEditor` | `lateAdditions`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftNodeId` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `draftOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `draftRows` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts`, `dryHops` | the catalog editors bind the shared draft grid |
| `edit` | `fieldActions` | `hop`, `lateAdditions`, `water` | shared field verbs: the card partials bind the one editing surface |
| `editDraftCell` | `draftEditor` | `fieldActions` | fieldActions drives a draft cell edit: the inverse of the shared draft grid |
| `editNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `hopStrategy` | `hop` | `snapshot` | the draft snapshot persists the batch-level hop strategy |
| `inputDraft` | `fieldActions` | `draftEditor`, `lateAdditions`, `libraryUi`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `water` | shared text-input draft: every card edits a field through the one input map |
| `inputKey` | `fieldActions` | `lateAdditions`, `libraryUi`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `water` | shared text-input draft: every card edits a field through the one input map |
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
| `styleGravityDisplay` | `styleNavigator` | `styleTargets` | the pin input and its readouts print the gravity unit the navigator's plot uses |
| `styleTargetInfo` | `styleNavigator` | `styleTargets` | the style target card mirrors the navigator's target readout |
| `syncScalePreviewState` | `lateAdditions` | `styleTargets` | the style card drives the late-addition scale preview; Phase 3 extracts it |
| `toggleFieldUnit` | `unitActions` | `fieldActions` | unit toggling is shared between the hop card and the generic card shell |
| `updateStylePreview` | `styleNavigator` | `styleTargets` | a pin or target edit refreshes the navigator's cached plot model |
| `waterTargetOptions` | `water` | `fieldActions` | the generic card shell renders the water target selector |
| `waterTargetSelection` | `water` | `fieldActions` | the generic card shell renders the water target selector |
