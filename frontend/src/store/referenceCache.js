// Reference cache: immutable seed data resolved by id (seed-substrate.md).
// Every catalog seed is a flat id-keyed map of schema-conforming components
// (normalized in Step G), so no per-file adapters are needed here.
//
// Server-persisted library records are layered on as a live overlay:
// `syncLibraryItems` rebuilds the per-schema/per-seed maps (record > seed) and
// swaps in a brand-new `references`/`seeds` pair, so no holder of the previous
// catalogue can observe a half-updated map. The engine captures `references` at
// construction, so the caller that owns both must hand the new map to the
// engine (`setReferences`), which re-resolves the ingredient priors and drops
// its memo. A loaded batch still never re-reads the overlay for its selections
// — its snapshots own those.

import artifact from "../engine/artifact.json" with { type: "json" };
import equipmentRaw from "../../../data/seeds/equipment.json" with { type: "json" };
import malts from "../../../data/seeds/malts.json" with { type: "json" };
import standardMalts from "../../../data/seeds/standard-malts.json" with { type: "json" };
import hops from "../../../data/seeds/hops.json" with { type: "json" };
import hopProducts from "../../../data/seeds/hop-products.json" with { type: "json" };
import sugars from "../../../data/seeds/sugars.json" with { type: "json" };
import yeasts from "../../../data/seeds/yeasts.json" with { type: "json" };
import styles from "../../../data/seeds/styles.json" with { type: "json" };
import waterTargets from "../../../data/seeds/water_target_profiles.json" with { type: "json" };
import waterReports from "../../../data/seeds/water_reports.json" with { type: "json" };
import mashSchedules from "../../../data/seeds/mash-schedules.json" with { type: "json" };
import whirlpoolNotes from "../../../data/seeds/whirlpool-notes.json" with { type: "json" };
import coolingCurves from "../../../data/seeds/cooling_curves.json" with { type: "json" };
import { ingestEquipment } from "./equipmentIngest.js";
import { CATALOGS } from "./userCatalog.js";
import { defaultBrewDayRows } from "../views/brewDayLogic.js";

const equipment = ingestEquipment(equipmentRaw, artifact);

const BASE_REFERENCES = {
  equipment,
  yeast: yeasts,
  hop: hops,
  style: styles,
  water_report: waterReports,
  water_target: waterTargets,
};

// The generic representative set (`std:`-prefixed) is merged into the malt
// catalog so pickers and the default grist resolve them uniformly.
const allMalts = { ...malts, ...standardMalts };

const BASE_SEEDS = {
  equipment,
  malts: allMalts,
  hops,
  hopProducts,
  sugars,
  yeasts,
  styles,
  waterTargets,
  waterReports,
  mashSchedules,
  whirlpoolNotes,
  coolingCurves,
};

const DEFAULT_GRIST = [
  { catalog_id: "std:pale-ale-malt", pct: 0.8, parts: 80 },
  { catalog_id: "std:caramel-40l", pct: 0.2, parts: 20 },
];

function buildGristRow(entry) {
  const malt = allMalts[entry.catalog_id];
  return {
    catalog_id: entry.catalog_id,
    name: malt.name,
    category: malt.category,
    parts: entry.parts,
    pct: entry.pct,
    yield_fraction: malt.yield_fraction,
    color_lovibond: malt.color_lovibond,
    notes: malt.notes,
  };
}

// Build a whole new catalogue for this overlay. Record > seed at both layers:
// `references` backs the engine's legacy selection fallback, `seeds` backs the
// pickers and the import ledger.
function overlayLibraryItems(items) {
  const references = { ...BASE_REFERENCES };
  const seeds = { ...BASE_SEEDS };
  const libraryIds = new Set();
  for (const [catalog, meta] of Object.entries(CATALOGS)) {
    const records = items?.[catalog] ?? {};
    for (const id of Object.keys(records)) libraryIds.add(id);
    if (meta.referencesKey) {
      references[meta.referencesKey] = { ...BASE_REFERENCES[meta.referencesKey], ...records };
    }
    if (meta.seedKey) {
      seeds[meta.seedKey] = { ...BASE_SEEDS[meta.seedKey], ...records };
    }
  }
  return { references, seeds, libraryIds };
}

export function createReferenceCache() {
  const cache = {
    references: { ...BASE_REFERENCES },
    collections: {
      "grist.major_malts": DEFAULT_GRIST.map(buildGristRow),
      "grist.trace_malts": [],
      "mash.rests": mashSchedules["single_infusion"].rests,
      "batch.sugars": [],
      "batch.boil_hops": [],
      "batch.whirlpool_hops": [],
      "batch.dry_hops": [],
      "batch.brew_checklist": defaultBrewDayRows(),
    },
    seeds: { ...BASE_SEEDS },
    libraryIds: new Set(),

    // Replace both catalogue layers with a fresh snapshot. The previous maps are
    // never touched, so a reader holding one keeps the view it started with, and
    // removing a record reveals the seed again. Returns the snapshot the caller
    // can hand to the engine.
    syncLibraryItems(items) {
      const snapshot = overlayLibraryItems(items);
      cache.references = snapshot.references;
      cache.seeds = snapshot.seeds;
      cache.libraryIds = snapshot.libraryIds;
      return snapshot;
    },

    isLibraryItem(id) {
      return cache.libraryIds.has(id);
    },
  };
  return cache;
}
