# Frontend app ownership

Generated from `frontend/src/adapters/installers.js` — do not edit by hand.
Re-sync after any installer change: `node scripts/emit-ownership-index.mjs`.

- Declared members: **567** (388 enumerable, 179 hidden)
- Installers: **19**
- Card partials: **15**
- Installers reading another installer's key: **15 of 19**
- Cross-owner keys declared in `SHARED`: **47**

## Installers

| installer | modules | members | card partials | foreign reads |
|---|---|---|---|---|
| `navigation` | `frontend/src/adapters/navigation.js` | 5 | 0 | 0 |
| `fieldActions` | `frontend/src/adapters/fieldActions.js` | 27 | 1 | 5 |
| `draftEditor` | `frontend/src/adapters/draftEditor.js` | 28 | 0 | 1 |
| `unitActions` | `frontend/src/adapters/unitActions.js` | 6 | 0 | 0 |
| `snapshot` | `frontend/src/store/snapshot.js` | 7 | 0 | 1 |
| `libraryUi` | `frontend/src/adapters/libraryUi.js` | 41 | 0 | 4 |
| `yeast` | `frontend/src/adapters/cards/yeast.js` | 27 | 1 | 0 |
| `styleDeclaration` | `frontend/src/adapters/cards/style/declaration.js` | 7 | 1 | 3 |
| `styleNavigator` | `frontend/src/adapters/cards/style/navigator.js` | 25 | 1 | 6 |
| `styleTargets` | `frontend/src/adapters/cards/style/targets.js` | 36 | 1 | 8 |
| `styleConformance` | `frontend/src/adapters/cards/style/conformance.js` | 4 | 1 | 3 |
| `hop` | `frontend/src/adapters/cards/hops.js`, `frontend/src/adapters/cards/catalogDraft.js` | 110 | 3 | 22 |
| `lateAdditions` | `frontend/src/adapters/cards/late-additions.js`, `frontend/src/adapters/cards/catalogDraft.js` | 65 | 2 | 24 |
| `traceMalts` | `frontend/src/adapters/cards/trace-malts.js`, `frontend/src/adapters/cards/catalogDraft.js` | 41 | 2 | 24 |
| `malt` | `frontend/src/adapters/cards/malt.js`, `frontend/src/adapters/cards/catalogDraft.js` | 46 | 2 | 22 |
| `mash` | `frontend/src/adapters/cards/mash.js` | 51 | 2 | 5 |
| `brewDay` | `frontend/src/adapters/cards/brew-day.js` | 11 | 1 | 1 |
| `water` | `frontend/src/adapters/cards/water.js` | 29 | 1 | 6 |
| `modalFocus` | `frontend/src/adapters/modalFocus.js` | 1 | 0 | 0 |

## Members

| member | owner | surface | templates |
|---|---|---|---|
| `_convert` | `mash` | public | 0 |
| `_materializeRests` | `mash` | public | 0 |
| `_writeBrewDayRows` | `brewDay` | public | 0 |
| `_writeMashRests` | `mash` | public | 0 |
| `activeKind` | `libraryUi` | hidden | 0 |
| `activeKindHasNotes` | `libraryUi` | hidden | 1 |
| `activeKindLabel` | `libraryUi` | hidden | 1 |
| `activeScaleTarget` | `styleTargets` | public | 0 |
| `activeScaleTargetDisplay` | `styleTargets` | public | 1 |
| `activeScaleTargetLabel` | `styleTargets` | public | 1 |
| `activeScaleTargetRoot` | `styleTargets` | public | 0 |
| `activeScaleTargetStep` | `styleTargets` | public | 1 |
| `activeScaleTargetUnit` | `styleTargets` | public | 1 |
| `addCatalogHop` | `hop` | public | 1 |
| `addCatalogMalt` | `malt` | public | 1 |
| `addCatalogSugar` | `lateAdditions` | public | 1 |
| `addCatalogTrace` | `traceMalts` | public | 1 |
| `addCatalogWhirlpoolHop` | `hop` | public | 1 |
| `addDraftRow` | `draftEditor` | public | 0 |
| `addRow` | `fieldActions` | public | 0 |
| `adoptLateAdditionDose` | `lateAdditions` | public | 1 |
| `adoptLateAdditionShare` | `lateAdditions` | public | 1 |
| `afterCompute` | `styleNavigator` | public | 0 |
| `attenuationBlend` | `styleNavigator` | public | 1 |
| `attenuationCap` | `styleNavigator` | public | 1 |
| `attenuationSugarLift` | `styleNavigator` | public | 1 |
| `boilHopMassKg` | `hop` | public | 0 |
| `boilHopTotalMassDisplay` | `hop` | hidden | 1 |
| `boilIbu` | `styleTargets` | public | 0 |
| `boilIbuDisplay` | `styleTargets` | hidden | 1 |
| `boilIbuField` | `hop` | hidden | 1 |
| `brewDayInstruction` | `brewDay` | public | 1 |
| `brewDayOpenSections` | `brewDay` | public | 0 |
| `brewDayPayload` | `brewDay` | hidden | 0 |
| `brewDayRow` | `brewDay` | public | 0 |
| `brewDayRows` | `brewDay` | public | 0 |
| `brewDaySections` | `brewDay` | hidden | 1 |
| `canAuthorRecord` | `libraryUi` | hidden | 1 |
| `canForkRecord` | `libraryUi` | hidden | 1 |
| `cancelHopEditor` | `hop` | public | 1 |
| `cancelLibraryItem` | `libraryUi` | public | 1 |
| `cancelMaltEditor` | `malt` | public | 1 |
| `cancelSugarEditor` | `lateAdditions` | public | 1 |
| `cancelTraceEditor` | `traceMalts` | public | 1 |
| `cancelWhirlpoolHopEditor` | `hop` | public | 1 |
| `canonicalMashRests` | `mash` | hidden | 1 |
| `centerOrClampStyleAbv` | `styleNavigator` | public | 0 |
| `clampToSelection` | `fieldActions` | public | 0 |
| `clearHopStandard` | `hop` | public | 0 |
| `clearInputDraft` | `fieldActions` | public | 0 |
| `clearMaltStandard` | `malt` | public | 1 |
| `clearSugarStandard` | `lateAdditions` | public | 0 |
| `clearTraceStandard` | `traceMalts` | public | 1 |
| `clearWaterPreset` | `water` | public | 0 |
| `clearWhirlpoolHopStandard` | `hop` | public | 0 |
| `clearYeastSelection` | `yeast` | public | 1 |
| `cloneDraftMalt` | `malt` | public | 1 |
| `closeDraft` | `draftEditor` | public | 0 |
| `closeHopDrawer` | `hop` | public | 1 |
| `closeLibrary` | `libraryUi` | public | 1 |
| `closeMaltDrawer` | `malt` | public | 1 |
| `closeMashModal` | `mash` | public | 1 |
| `closeSugarDrawer` | `lateAdditions` | public | 1 |
| `closeTraceDrawer` | `traceMalts` | public | 1 |
| `closeUnits` | `unitActions` | public | 1 |
| `closeWhirlpoolHopDrawer` | `hop` | public | 1 |
| `colorDisplay` | `draftEditor` | public | 2 |
| `colorUnit` | `draftEditor` | public | 2 |
| `commitCellInput` | `fieldActions` | public | 1 |
| `commitDraftCellInput` | `fieldActions` | public | 5 |
| `commitField` | `fieldActions` | public | 0 |
| `commitMashSchedule` | `mash` | public | 1 |
| `commitNumberInput` | `fieldActions` | public | 3 |
| `commitScaleTargetInput` | `styleTargets` | public | 1 |
| `commitWaterNumber` | `water` | public | 1 |
| `commitWaterTargetInput` | `water` | public | 1 |
| `commitYeastDerate` | `yeast` | public | 1 |
| `computeStyleTarget` | `styleNavigator` | public | 0 |
| `confirmDraftDiscard` | `draftEditor` | public | 1 |
| `conformanceSummary` | `styleConformance` | hidden | 1 |
| `copyInCascade` | `fieldActions` | public | 0 |
| `deleteLibraryItem` | `libraryUi` | public | 1 |
| `derateHelpOpen` | `yeast` | public | 1 |
| `dialogFocus` | `modalFocus` | public | 9 |
| `dismissDraftDiscard` | `draftEditor` | public | 1 |
| `doughInDisplay` | `mash` | hidden | 1 |
| `doughInInheritedTempC` | `mash` | hidden | 0 |
| `draftBaseline` | `draftEditor` | public | 0 |
| `draftColumns` | `draftEditor` | hidden | 5 |
| `draftDirty` | `draftEditor` | hidden | 0 |
| `draftDiscardOpen` | `draftEditor` | public | 1 |
| `draftDisplayRows` | `draftEditor` | hidden | 5 |
| `draftEntry` | `draftEditor` | public | 0 |
| `draftMassDisplay` | `draftEditor` | public | 0 |
| `draftNodeId` | `draftEditor` | public | 5 |
| `draftOpen` | `draftEditor` | public | 0 |
| `draftResolvedRows` | `draftEditor` | public | 0 |
| `draftRows` | `draftEditor` | public | 5 |
| `draftSnapshot` | `draftEditor` | public | 0 |
| `draftState` | `snapshot` | public | 0 |
| `duplicateCatalogHop` | `hop` | public | 1 |
| `duplicateCatalogMalt` | `malt` | public | 1 |
| `duplicateCatalogSugar` | `lateAdditions` | public | 1 |
| `duplicateCatalogTrace` | `traceMalts` | public | 1 |
| `duplicateCatalogWhirlpoolHop` | `hop` | public | 1 |
| `edit` | `fieldActions` | public | 3 |
| `editCell` | `fieldActions` | public | 0 |
| `editCellInput` | `fieldActions` | public | 1 |
| `editDraftCell` | `draftEditor` | public | 0 |
| `editDraftCellInput` | `fieldActions` | public | 5 |
| `editNumberInput` | `fieldActions` | public | 3 |
| `editScaleTargetInput` | `styleTargets` | public | 1 |
| `editWaterNumber` | `water` | public | 1 |
| `editWaterTarget` | `water` | public | 0 |
| `editWaterTargetInput` | `water` | public | 1 |
| `enabledMashRests` | `mash` | hidden | 1 |
| `fermentationField` | `styleDeclaration` | hidden | 1 |
| `fermentationProvenance` | `styleDeclaration` | hidden | 0 |
| `filteredYeasts` | `yeast` | hidden | 1 |
| `forkLibraryItem` | `libraryUi` | public | 1 |
| `freezePayload` | `snapshot` | public | 0 |
| `getRestDefinition` | `mash` | public | 0 |
| `grainColorUnit` | `draftEditor` | public | 0 |
| `gristRows` | `malt` | public | 1 |
| `handleHopEscape` | `hop` | public | 1 |
| `handleMaltEscape` | `malt` | public | 1 |
| `handleSugarEscape` | `lateAdditions` | public | 1 |
| `handleTraceEscape` | `traceMalts` | public | 1 |
| `handleWhirlpoolHopEscape` | `hop` | public | 1 |
| `hopActiveIndex` | `hop` | public | 1 |
| `hopActiveRow` | `hop` | hidden | 1 |
| `hopAlpha` | `hop` | public | 0 |
| `hopAlphaInput` | `hop` | public | 1 |
| `hopAlphaOutsideStock` | `hop` | public | 1 |
| `hopAlphaRange` | `hop` | public | 1 |
| `hopBoilPct` | `hop` | public | 1 |
| `hopBoundaryTotalMassKg` | `hop` | public | 0 |
| `hopCatalog` | `hop` | hidden | 0 |
| `hopCatalogTruncated` | `hop` | hidden | 0 |
| `hopCategories` | `hop` | hidden | 1 |
| `hopCategoryFilter` | `hop` | public | 1 |
| `hopDraftPartsTotal` | `hop` | hidden | 1 |
| `hopDraftSummary` | `hop` | hidden | 1 |
| `hopDrawer` | `hop` | public | 1 |
| `hopEditorOpen` | `hop` | hidden | 1 |
| `hopFamilies` | `hop` | hidden | 0 |
| `hopFamily` | `hop` | public | 0 |
| `hopFilteredCatalog` | `hop` | hidden | 1 |
| `hopForm` | `hop` | public | 1 |
| `hopGroupMeta` | `hop` | public | 0 |
| `hopIbu` | `hop` | public | 1 |
| `hopItemMeta` | `hop` | public | 1 |
| `hopMass` | `hop` | public | 1 |
| `hopMassUnit` | `hop` | hidden | 1 |
| `hopMinutes` | `hop` | public | 1 |
| `hopPct` | `hop` | public | 1 |
| `hopProductMatches` | `hop` | hidden | 0 |
| `hopResultLabel` | `hop` | hidden | 1 |
| `hopRows` | `hop` | public | 1 |
| `hopSearch` | `hop` | public | 1 |
| `hopSearchNotes` | `hop` | public | 1 |
| `hopStandard` | `hop` | public | 0 |
| `hopStandardGroups` | `hop` | hidden | 0 |
| `hopStandardName` | `hop` | hidden | 0 |
| `hopTemp` | `hop` | public | 1 |
| `hopTotalMassDisplay` | `hop` | hidden | 1 |
| `hopTotalMassKg` | `hop` | hidden | 0 |
| `hopVisibleCatalog` | `hop` | hidden | 1 |
| `ibuGu` | `styleTargets` | hidden | 0 |
| `ibuGuDisplay` | `styleTargets` | hidden | 1 |
| `ibuTargetField` | `styleTargets` | hidden | 1 |
| `ibuTargetProvenance` | `styleTargets` | hidden | 1 |
| `identityTabs` | `libraryUi` | hidden | 1 |
| `inputDraft` | `fieldActions` | public | 10 |
| `inputDrafts` | `fieldActions` | public | 0 |
| `inputKey` | `fieldActions` | public | 10 |
| `inspectHopRow` | `hop` | public | 1 |
| `inspectMaltRow` | `malt` | public | 1 |
| `inspectSugarRow` | `lateAdditions` | public | 0 |
| `inspectTraceRow` | `traceMalts` | public | 1 |
| `inspectWhirlpoolHopRow` | `hop` | public | 1 |
| `isBrewDaySectionOpen` | `brewDay` | public | 1 |
| `isMashDraftValid` | `mash` | hidden | 1 |
| `isRestOutOfRange` | `mash` | public | 1 |
| `isYeastListTruncated` | `yeast` | hidden | 0 |
| `keyNav` | `navigation` | public | 1 |
| `lateAdditionIntent` | `lateAdditions` | hidden | 2 |
| `lateAdditionIntentState` | `lateAdditions` | hidden | 0 |
| `lateExtractField` | `lateAdditions` | hidden | 1 |
| `lateIntentField` | `lateAdditions` | hidden | 1 |
| `latePinPanelOpen` | `lateAdditions` | public | 1 |
| `latePinPanelVisible` | `lateAdditions` | public | 1 |
| `lateSugarField` | `lateAdditions` | hidden | 1 |
| `libraryCommitField` | `libraryUi` | public | 1 |
| `libraryDraft` | `libraryUi` | public | 1 |
| `libraryError` | `libraryUi` | hidden | 1 |
| `libraryErrors` | `libraryUi` | public | 1 |
| `libraryFieldDisplay` | `libraryUi` | public | 1 |
| `libraryFields` | `libraryUi` | hidden | 1 |
| `libraryItemId` | `libraryUi` | public | 1 |
| `libraryItemTitle` | `libraryUi` | public | 1 |
| `libraryLoading` | `libraryUi` | hidden | 1 |
| `libraryNotice` | `libraryUi` | public | 1 |
| `libraryOpen` | `libraryUi` | public | 1 |
| `libraryRecords` | `libraryUi` | hidden | 1 |
| `librarySearch` | `libraryUi` | public | 1 |
| `librarySearchFields` | `libraryUi` | hidden | 0 |
| `librarySearchNotes` | `libraryUi` | public | 1 |
| `librarySection` | `libraryUi` | public | 1 |
| `librarySeedCount` | `libraryUi` | hidden | 1 |
| `librarySeedItemTitle` | `libraryUi` | public | 1 |
| `librarySeedItems` | `libraryUi` | hidden | 1 |
| `librarySetField` | `libraryUi` | public | 1 |
| `librarySetSearch` | `libraryUi` | public | 1 |
| `libraryTab` | `libraryUi` | public | 1 |
| `libraryTabs` | `libraryUi` | hidden | 1 |
| `maltActiveIndex` | `malt` | public | 1 |
| `maltActiveRow` | `malt` | hidden | 1 |
| `maltAtLimit` | `malt` | hidden | 1 |
| `maltCatalog` | `malt` | hidden | 0 |
| `maltCatalogTruncated` | `malt` | hidden | 0 |
| `maltCategories` | `malt` | hidden | 2 |
| `maltCategoryFilter` | `malt` | public | 0 |
| `maltDraftTotals` | `malt` | hidden | 1 |
| `maltDrawer` | `malt` | public | 1 |
| `maltEditorOpen` | `malt` | hidden | 1 |
| `maltFamilies` | `malt` | hidden | 1 |
| `maltFamily` | `malt` | public | 1 |
| `maltFermentable` | `malt` | public | 1 |
| `maltFilteredCatalog` | `malt` | hidden | 1 |
| `maltGroupMeta` | `malt` | public | 1 |
| `maltIsTrace` | `malt` | public | 2 |
| `maltItemMeta` | `malt` | public | 1 |
| `maltProductMatches` | `malt` | hidden | 1 |
| `maltSearch` | `malt` | public | 1 |
| `maltSearchNotes` | `malt` | public | 1 |
| `maltStandard` | `malt` | public | 1 |
| `maltStandardGroups` | `malt` | hidden | 1 |
| `maltStandardName` | `malt` | hidden | 1 |
| `maltTotalParts` | `malt` | hidden | 0 |
| `maltTotalPct` | `malt` | hidden | 0 |
| `maltValidation` | `malt` | hidden | 1 |
| `maltVisibleCatalog` | `malt` | hidden | 1 |
| `maltWeightedColor` | `malt` | hidden | 1 |
| `maltWeightedYield` | `malt` | hidden | 1 |
| `mashDoughInTempC` | `mash` | public | 0 |
| `mashDraft` | `mash` | public | 0 |
| `mashDraftDirty` | `mash` | public | 0 |
| `mashDraftRow` | `mash` | public | 0 |
| `mashField` | `mash` | public | 1 |
| `mashLgrBelowFloor` | `mash` | hidden | 1 |
| `mashLgrSummary` | `mash` | hidden | 1 |
| `mashModalOpen` | `mash` | public | 1 |
| `mashPresetId` | `mash` | hidden | 1 |
| `mashPresetIdState` | `mash` | hidden | 0 |
| `mashPresetLabels` | `mash` | hidden | 1 |
| `mashRampTimeMin` | `mash` | public | 0 |
| `mashRests` | `mash` | public | 0 |
| `mashThicknessDisplay` | `mash` | hidden | 0 |
| `mashThicknessLPerKg` | `mash` | public | 0 |
| `mashThicknessUnit` | `mash` | hidden | 0 |
| `mashThicknessUnitId` | `mash` | hidden | 0 |
| `mashTimeSummary` | `mash` | hidden | 1 |
| `mashTotalTimeMin` | `mash` | public | 0 |
| `materializeWaterTargets` | `water` | public | 0 |
| `minLgrDisplay` | `mash` | hidden | 0 |
| `minLgrLPerKg` | `mash` | public | 0 |
| `newLibraryItem` | `libraryUi` | public | 1 |
| `next` | `navigation` | public | 1 |
| `normalizeDraft` | `draftEditor` | public | 0 |
| `normalizeGrist` | `fieldActions` | public | 0 |
| `normalizeHopRows` | `fieldActions` | public | 0 |
| `onBatchLoad` | `styleNavigator` | public | 0 |
| `onMashPresetChange` | `mash` | public | 1 |
| `openDraft` | `draftEditor` | public | 0 |
| `openHopEditor` | `hop` | public | 1 |
| `openHopSearch` | `hop` | public | 1 |
| `openLibrary` | `libraryUi` | public | 1 |
| `openMaltEditor` | `malt` | public | 1 |
| `openMaltSearch` | `malt` | public | 1 |
| `openMashModal` | `mash` | public | 1 |
| `openSugarEditor` | `lateAdditions` | public | 1 |
| `openSugarSearch` | `lateAdditions` | public | 1 |
| `openTraceEditor` | `traceMalts` | public | 1 |
| `openTraceSearch` | `traceMalts` | public | 1 |
| `openWhirlpoolHopEditor` | `hop` | public | 1 |
| `openWhirlpoolHopSearch` | `hop` | public | 1 |
| `patchDraftRow` | `draftEditor` | public | 1 |
| `pinMashThickness` | `fieldActions` | public | 0 |
| `prev` | `navigation` | public | 1 |
| `previewCompositionCaption` | `lateAdditions` | public | 1 |
| `previewDoseDisplay` | `lateAdditions` | public | 0 |
| `rampTimeMin` | `mash` | hidden | 1 |
| `refreshTargets` | `styleTargets` | public | 0 |
| `removeDraftRow` | `draftEditor` | public | 1 |
| `removeHop` | `hop` | public | 1 |
| `removeMalt` | `malt` | public | 1 |
| `removeRow` | `fieldActions` | public | 1 |
| `removeSugar` | `lateAdditions` | public | 0 |
| `removeTrace` | `traceMalts` | public | 1 |
| `removeWhirlpoolHop` | `hop` | public | 1 |
| `reportCatalog` | `snapshot` | public | 0 |
| `reportFormatted` | `snapshot` | public | 0 |
| `reportFormattedSummaries` | `snapshot` | public | 0 |
| `reportFormattedTables` | `snapshot` | public | 0 |
| `reportInputs` | `snapshot` | public | 0 |
| `resetField` | `fieldActions` | public | 2 |
| `resetIntensiveValue` | `fieldActions` | public | 0 |
| `resetScaleTarget` | `styleTargets` | public | 1 |
| `resetSeededRoots` | `fieldActions` | public | 0 |
| `resetStyleTarget` | `styleNavigator` | public | 0 |
| `resetUnits` | `unitActions` | public | 1 |
| `resetWaterTargets` | `water` | public | 0 |
| `restBoundDisplay` | `mash` | public | 1 |
| `restName` | `mash` | public | 2 |
| `restPurpose` | `mash` | public | 2 |
| `restTempRangeDisplay` | `mash` | public | 1 |
| `restTimeMin` | `mash` | hidden | 0 |
| `restUseTempDisplay` | `mash` | public | 2 |
| `runAction` | `fieldActions` | public | 1 |
| `runCollectionAdd` | `fieldActions` | public | 1 |
| `runFindingAction` | `fieldActions` | public | 1 |
| `saveDraft` | `draftEditor` | public | 0 |
| `saveHopEditor` | `hop` | public | 1 |
| `saveLibraryItem` | `libraryUi` | public | 1 |
| `saveMaltEditor` | `malt` | public | 1 |
| `saveSugarEditor` | `lateAdditions` | public | 1 |
| `saveTraceEditor` | `traceMalts` | public | 1 |
| `saveWhirlpoolHopEditor` | `hop` | public | 1 |
| `scalePin` | `styleTargets` | public | 1 |
| `scalePinLabel` | `styleTargets` | public | 1 |
| `scalePinOptions` | `styleTargets` | hidden | 1 |
| `scalePreviewRows` | `lateAdditions` | public | 1 |
| `scaleTargetMismatch` | `styleTargets` | public | 1 |
| `seedShareFromDose` | `lateAdditions` | public | 0 |
| `seedSugarShareWeights` | `draftEditor` | public | 0 |
| `selectHopStandard` | `hop` | public | 0 |
| `selectLibrarySection` | `libraryUi` | public | 1 |
| `selectLibraryTab` | `libraryUi` | public | 1 |
| `selectMaltStandard` | `malt` | public | 1 |
| `selectSourceKind` | `libraryUi` | public | 1 |
| `selectStep` | `navigation` | public | 0 |
| `selectSugarStandard` | `lateAdditions` | public | 0 |
| `selectTraceStandard` | `traceMalts` | public | 1 |
| `selectWaterTarget` | `water` | public | 2 |
| `selectWhirlpoolHopStandard` | `hop` | public | 0 |
| `selectYeast` | `yeast` | public | 1 |
| `selectedStyle` | `styleDeclaration` | hidden | 1 |
| `selectedStyleId` | `styleDeclaration` | public | 0 |
| `selectedYeast` | `yeast` | hidden | 1 |
| `selectedYeastId` | `yeast` | public | 1 |
| `selectedYeastTemp` | `yeast` | hidden | 1 |
| `setBrewDayInstruction` | `brewDay` | public | 1 |
| `setColorField` | `draftEditor` | public | 2 |
| `setFieldUnit` | `unitActions` | public | 0 |
| `setHopAlpha` | `hop` | public | 1 |
| `setInputDraft` | `fieldActions` | public | 0 |
| `setLateAdditionIntent` | `lateAdditions` | public | 1 |
| `setMaltField` | `draftEditor` | public | 4 |
| `setMashDraftDuration` | `mash` | public | 1 |
| `setMashDraftTemp` | `mash` | public | 1 |
| `setScalePin` | `styleTargets` | public | 1 |
| `setScaleTarget` | `styleTargets` | public | 0 |
| `setStyleTargetAbv` | `styleNavigator` | public | 0 |
| `setTargetIbu` | `styleTargets` | public | 1 |
| `setTargetSrm` | `styleTargets` | public | 1 |
| `setUnit` | `unitActions` | public | 1 |
| `setWhirlpoolFraction` | `styleTargets` | public | 1 |
| `setWhirlpoolHopCatalogForm` | `hop` | public | 1 |
| `sortedMashDraftRests` | `mash` | hidden | 1 |
| `sortedMashRests` | `mash` | hidden | 0 |
| `sourceKind` | `libraryUi` | public | 1 |
| `srmTargetField` | `styleTargets` | hidden | 1 |
| `srmTargetProvenance` | `styleTargets` | hidden | 1 |
| `strikeWaterTempDisplay` | `mash` | public | 1 |
| `styleAbvBounds` | `styleNavigator` | hidden | 0 |
| `styleAbvCentered` | `styleNavigator` | public | 0 |
| `styleAbvTarget` | `styleNavigator` | hidden | 0 |
| `styleAbvTouched` | `styleNavigator` | public | 0 |
| `styleConformance` | `styleConformance` | public | 1 |
| `styleConformanceReport` | `styleConformance` | public | 0 |
| `styleEnvelope` | `styleNavigator` | public | 0 |
| `styleEnvelopeFields` | `styleDeclaration` | hidden | 1 |
| `styleExtract` | `styleNavigator` | public | 1 |
| `styleGravity` | `styleDeclaration` | public | 0 |
| `styleIbuBounds` | `styleTargets` | hidden | 1 |
| `stylePreview` | `styleNavigator` | hidden | 1 |
| `styleRegion` | `styleNavigator` | public | 0 |
| `styleSafestPoint` | `styleNavigator` | public | 0 |
| `styleSai` | `styleConformance` | public | 1 |
| `styleSolvedAa` | `styleNavigator` | public | 0 |
| `styleSolvedCap` | `styleNavigator` | public | 0 |
| `styleSolvedVolume` | `styleNavigator` | public | 0 |
| `styleSrmBounds` | `styleTargets` | hidden | 1 |
| `styleTargetInfo` | `styleNavigator` | hidden | 1 |
| `styleTargetNearest` | `styleNavigator` | public | 1 |
| `styleTargetRisk` | `styleNavigator` | hidden | 1 |
| `styleVitals` | `styleDeclaration` | public | 1 |
| `sugarActiveIndex` | `lateAdditions` | public | 0 |
| `sugarActiveRow` | `lateAdditions` | hidden | 0 |
| `sugarCatalog` | `lateAdditions` | hidden | 0 |
| `sugarCatalogTruncated` | `lateAdditions` | hidden | 0 |
| `sugarCategories` | `lateAdditions` | hidden | 0 |
| `sugarCategoryFilter` | `lateAdditions` | public | 0 |
| `sugarColorField` | `lateAdditions` | hidden | 1 |
| `sugarCountLabel` | `lateAdditions` | hidden | 1 |
| `sugarDraftExtractDisplay` | `lateAdditions` | hidden | 1 |
| `sugarDraftMassDisplay` | `lateAdditions` | hidden | 1 |
| `sugarDrawer` | `lateAdditions` | public | 1 |
| `sugarEditorOpen` | `lateAdditions` | hidden | 1 |
| `sugarEffect` | `lateAdditions` | hidden | 0 |
| `sugarEffectDisplay` | `lateAdditions` | hidden | 1 |
| `sugarEffectDisplayState` | `lateAdditions` | hidden | 0 |
| `sugarEffectState` | `lateAdditions` | hidden | 0 |
| `sugarFamilies` | `lateAdditions` | hidden | 0 |
| `sugarFamily` | `lateAdditions` | public | 0 |
| `sugarField` | `lateAdditions` | public | 0 |
| `sugarFilteredCatalog` | `lateAdditions` | hidden | 1 |
| `sugarGroupMeta` | `lateAdditions` | public | 0 |
| `sugarIsActive` | `lateAdditions` | hidden | 0 |
| `sugarItemMeta` | `lateAdditions` | public | 1 |
| `sugarList` | `lateAdditions` | public | 0 |
| `sugarMassField` | `lateAdditions` | hidden | 1 |
| `sugarProductMatches` | `lateAdditions` | hidden | 0 |
| `sugarResultLabel` | `lateAdditions` | hidden | 1 |
| `sugarSearch` | `lateAdditions` | public | 1 |
| `sugarSearchNotes` | `lateAdditions` | public | 1 |
| `sugarShareField` | `lateAdditions` | hidden | 1 |
| `sugarStandard` | `lateAdditions` | public | 0 |
| `sugarStandardGroups` | `lateAdditions` | hidden | 0 |
| `sugarStandardName` | `lateAdditions` | hidden | 0 |
| `sugarVisibleCatalog` | `lateAdditions` | hidden | 1 |
| `syncNav` | `navigation` | public | 0 |
| `syncScalePinState` | `styleTargets` | public | 0 |
| `syncScalePreviewState` | `lateAdditions` | public | 0 |
| `syncWaterTargets` | `water` | public | 0 |
| `targetIbu` | `styleTargets` | public | 1 |
| `targetSrm` | `styleTargets` | public | 1 |
| `telemetryClass` | `water` | public | 1 |
| `telemetryLine` | `water` | public | 1 |
| `temperatureUnit` | `mash` | hidden | 2 |
| `toggleBrewDaySection` | `brewDay` | public | 1 |
| `toggleBrewDayStep` | `brewDay` | public | 1 |
| `toggleDerateHelp` | `yeast` | public | 1 |
| `toggleFieldUnit` | `unitActions` | public | 1 |
| `toggleHopCategory` | `hop` | public | 1 |
| `toggleHopFamily` | `hop` | public | 0 |
| `toggleHopMassUnit` | `hop` | public | 1 |
| `toggleHopSearchNotes` | `hop` | public | 1 |
| `toggleLatePinPanel` | `lateAdditions` | public | 1 |
| `toggleLibrarySearchNotes` | `libraryUi` | public | 1 |
| `toggleMaltCategory` | `malt` | public | 0 |
| `toggleMaltFamily` | `malt` | public | 1 |
| `toggleMaltSearchNotes` | `malt` | public | 1 |
| `toggleMashRest` | `mash` | public | 1 |
| `toggleSugarCategory` | `lateAdditions` | public | 0 |
| `toggleSugarFamily` | `lateAdditions` | public | 0 |
| `toggleSugarSearchNotes` | `lateAdditions` | public | 1 |
| `toggleTraceCategory` | `traceMalts` | public | 0 |
| `toggleTraceFamily` | `traceMalts` | public | 1 |
| `toggleTraceSearchNotes` | `traceMalts` | public | 1 |
| `toggleUnits` | `unitActions` | public | 1 |
| `toggleWaterDetails` | `water` | public | 1 |
| `toggleWaterTarget` | `water` | public | 1 |
| `toggleWhirlpoolHopCategory` | `hop` | public | 1 |
| `toggleWhirlpoolHopFamily` | `hop` | public | 0 |
| `toggleWhirlpoolHopSearchNotes` | `hop` | public | 1 |
| `toggleYeastAttenuation` | `yeast` | public | 1 |
| `toggleYeastDiastaticus` | `yeast` | public | 1 |
| `toggleYeastSearchNotes` | `yeast` | public | 1 |
| `totalIbuField` | `hop` | hidden | 1 |
| `totalMashTimeDisplay` | `mash` | hidden | 1 |
| `totalMashTimeMin` | `mash` | hidden | 0 |
| `traceActiveIndex` | `traceMalts` | public | 1 |
| `traceActiveRow` | `traceMalts` | hidden | 1 |
| `traceCatalog` | `traceMalts` | hidden | 0 |
| `traceCatalogTruncated` | `traceMalts` | hidden | 0 |
| `traceCategories` | `traceMalts` | hidden | 0 |
| `traceCategoryFilter` | `traceMalts` | public | 0 |
| `traceColorField` | `traceMalts` | hidden | 1 |
| `traceDraftMassDisplay` | `traceMalts` | hidden | 1 |
| `traceDrawer` | `traceMalts` | public | 1 |
| `traceEditorOpen` | `traceMalts` | hidden | 1 |
| `traceFamilies` | `traceMalts` | hidden | 1 |
| `traceFamily` | `traceMalts` | public | 1 |
| `traceField` | `traceMalts` | public | 0 |
| `traceFilteredCatalog` | `traceMalts` | hidden | 1 |
| `traceGroupMeta` | `traceMalts` | public | 1 |
| `traceItemMeta` | `traceMalts` | public | 1 |
| `traceMaltField` | `traceMalts` | hidden | 1 |
| `traceMaltRows` | `traceMalts` | public | 1 |
| `traceMassField` | `traceMalts` | hidden | 1 |
| `traceProductMatches` | `traceMalts` | hidden | 1 |
| `traceSearch` | `traceMalts` | public | 1 |
| `traceSearchNotes` | `traceMalts` | public | 1 |
| `traceStandard` | `traceMalts` | public | 1 |
| `traceStandardGroups` | `traceMalts` | hidden | 1 |
| `traceStandardName` | `traceMalts` | hidden | 1 |
| `traceVisibleCatalog` | `traceMalts` | hidden | 1 |
| `visibleYeasts` | `yeast` | hidden | 1 |
| `waterDetails` | `water` | public | 1 |
| `waterDetailsOpen` | `water` | public | 1 |
| `waterInstruction` | `water` | public | 1 |
| `waterPlan` | `water` | public | 1 |
| `waterPrescription` | `water` | public | 1 |
| `waterSummary` | `water` | public | 1 |
| `waterTargetLocked` | `water` | public | 1 |
| `waterTargetOptions` | `water` | hidden | 2 |
| `waterTargetOptionsState` | `water` | hidden | 0 |
| `waterTargetProfileId` | `water` | hidden | 0 |
| `waterTargetSelection` | `water` | hidden | 2 |
| `waterTreatmentFields` | `water` | public | 1 |
| `waterVerdict` | `water` | public | 1 |
| `waterWarningCount` | `water` | public | 1 |
| `whirlpoolAmbientField` | `hop` | hidden | 1 |
| `whirlpoolCoolingField` | `hop` | hidden | 1 |
| `whirlpoolFraction` | `styleTargets` | public | 1 |
| `whirlpoolHopActiveIndex` | `hop` | public | 1 |
| `whirlpoolHopActiveRow` | `hop` | hidden | 1 |
| `whirlpoolHopCatalog` | `hop` | hidden | 0 |
| `whirlpoolHopCatalogForm` | `hop` | public | 1 |
| `whirlpoolHopCatalogTruncated` | `hop` | hidden | 0 |
| `whirlpoolHopCategories` | `hop` | hidden | 1 |
| `whirlpoolHopCategoryFilter` | `hop` | public | 1 |
| `whirlpoolHopDoseWarning` | `hop` | hidden | 1 |
| `whirlpoolHopDraftPartsTotal` | `hop` | hidden | 1 |
| `whirlpoolHopDraftSummary` | `hop` | hidden | 1 |
| `whirlpoolHopDrawer` | `hop` | public | 1 |
| `whirlpoolHopEditorOpen` | `hop` | hidden | 1 |
| `whirlpoolHopFamilies` | `hop` | hidden | 0 |
| `whirlpoolHopFamily` | `hop` | public | 0 |
| `whirlpoolHopFilteredCatalog` | `hop` | hidden | 1 |
| `whirlpoolHopForms` | `hop` | public | 1 |
| `whirlpoolHopGroupMeta` | `hop` | public | 0 |
| `whirlpoolHopItemMeta` | `hop` | public | 1 |
| `whirlpoolHopMass` | `hop` | public | 1 |
| `whirlpoolHopMassKg` | `hop` | public | 0 |
| `whirlpoolHopProductMatches` | `hop` | hidden | 0 |
| `whirlpoolHopResultLabel` | `hop` | hidden | 1 |
| `whirlpoolHopRows` | `hop` | public | 1 |
| `whirlpoolHopSearch` | `hop` | public | 1 |
| `whirlpoolHopSearchNotes` | `hop` | public | 1 |
| `whirlpoolHopStandard` | `hop` | public | 0 |
| `whirlpoolHopStandardGroups` | `hop` | hidden | 0 |
| `whirlpoolHopStandardName` | `hop` | hidden | 0 |
| `whirlpoolHopT90Equivalent` | `hop` | hidden | 1 |
| `whirlpoolHopTotalMassDisplay` | `hop` | hidden | 1 |
| `whirlpoolHopVisibleCatalog` | `hop` | hidden | 1 |
| `whirlpoolIbu` | `styleTargets` | public | 0 |
| `whirlpoolIbuDisplay` | `styleTargets` | hidden | 1 |
| `whirlpoolIbuField` | `hop` | hidden | 1 |
| `whirlpoolPctDisplay` | `styleTargets` | hidden | 1 |
| `writeStyleAbv` | `styleNavigator` | public | 0 |
| `writeWaterState` | `water` | public | 0 |
| `yeastAttenuation` | `yeast` | public | 1 |
| `yeastAttenuationFilter` | `yeast` | public | 1 |
| `yeastAttenuationTiers` | `yeast` | hidden | 1 |
| `yeastCatalog` | `yeast` | hidden | 0 |
| `yeastDiastaticusFilter` | `yeast` | public | 1 |
| `yeastDiastaticusTiers` | `yeast` | hidden | 1 |
| `yeastField` | `yeast` | public | 1 |
| `yeastManufacturerFilter` | `yeast` | public | 1 |
| `yeastManufacturers` | `yeast` | hidden | 1 |
| `yeastResultCount` | `yeast` | hidden | 0 |
| `yeastResultLabel` | `yeast` | hidden | 1 |
| `yeastSearchNotes` | `yeast` | public | 1 |
| `yeastSearchQuery` | `yeast` | public | 1 |

## Cross-owner reads

| key | owner | readers | reason |
|---|---|---|---|
| `activeScaleTarget` | `styleTargets` | `styleNavigator` | the style navigator reads the target selection the target card owns |
| `addDraftRow` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `clearInputDraft` | `fieldActions` | `libraryUi`, `styleTargets`, `water` | shared text-input draft: every card edits a field through the one input map |
| `closeDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `colorDisplay` | `draftEditor` | `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `colorUnit` | `draftEditor` | `malt`, `traceMalts` | the malt editors reuse the draft editor's colour and field helpers |
| `commitDraftCellInput` | `fieldActions` | `hop`, `lateAdditions`, `malt`, `traceMalts` | shared field verbs: the card partials bind the one editing surface |
| `commitField` | `fieldActions` | `water` | shared field verbs: the card partials bind the one editing surface |
| `commitNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `dialogFocus` | `modalFocus` | `hop`, `lateAdditions`, `malt`, `mash`, `traceMalts` | every modal shares the one focus trap |
| `dismissDraftDiscard` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftColumns` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftDirty` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDiscardOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `draftDisplayRows` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftMassDisplay` | `draftEditor` | `lateAdditions`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftNodeId` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftOpen` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `draftRows` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog editors bind the shared draft grid |
| `edit` | `fieldActions` | `hop`, `lateAdditions`, `water` | shared field verbs: the card partials bind the one editing surface |
| `editDraftCell` | `draftEditor` | `fieldActions` | fieldActions drives a draft cell edit: the inverse of the shared draft grid |
| `editDraftCellInput` | `fieldActions` | `hop`, `lateAdditions`, `malt`, `traceMalts` | shared field verbs: the card partials bind the one editing surface |
| `editNumberInput` | `fieldActions` | `lateAdditions`, `mash` | shared field verbs: the card partials bind the one editing surface |
| `inputDraft` | `fieldActions` | `draftEditor`, `hop`, `lateAdditions`, `libraryUi`, `malt`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `traceMalts`, `water` | shared text-input draft: every card edits a field through the one input map |
| `inputKey` | `fieldActions` | `hop`, `lateAdditions`, `libraryUi`, `malt`, `mash`, `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets`, `traceMalts`, `water` | shared text-input draft: every card edits a field through the one input map |
| `maltCategories` | `malt` | `traceMalts` | the trace-malt editor lists the malt card's categories |
| `openDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `patchDraftRow` | `draftEditor` | `hop` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `removeDraftRow` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
| `resetField` | `fieldActions` | `styleConformance`, `styleDeclaration`, `styleNavigator`, `styleTargets` | shared field verbs: the card partials bind the one editing surface |
| `resetScaleTarget` | `styleTargets` | `styleNavigator` | the style navigator reads the target selection the target card owns |
| `saveDraft` | `draftEditor` | `hop`, `lateAdditions`, `malt`, `traceMalts` | the catalog draft mixin delegates to the shared draft editor lifecycle |
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
| `waterInstruction` | `water` | `brewDay` | the brew-day checklist carries the water card's instruction text |
| `waterTargetOptions` | `water` | `fieldActions` | the generic card shell renders the water target selector |
| `waterTargetSelection` | `water` | `fieldActions` | the generic card shell renders the water target selector |
