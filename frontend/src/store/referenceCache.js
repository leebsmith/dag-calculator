// Reference cache: immutable seed data resolved by id (seed-substrate.md).
// Every catalog seed is a flat id-keyed map of schema-conforming components
// (normalized in Step G), so no per-file adapters are needed here.
//
// Server-persisted library records are layered on as a live overlay:
// `syncLibraryItems` merges them (record > seed) into the per-schema/per-seed
// maps in place, so pickers see them immediately. A loaded batch never re-reads
// them for selection values — its snapshots own those.

import artifact from "../engine/artifact.json" with { type: "json" };
import equipmentRaw from "../../../data/seeds/equipment.json" with { type: "json" };
import malts from "../../../data/seeds/malts.json" with { type: "json" };
import standardMalts from "../../../data/seeds/standard-malts.json" with { type: "json" };
import hops from "../../../data/seeds/hops.json" with { type: "json" };
import sugars from "../../../data/seeds/sugars.json" with { type: "json" };
import yeasts from "../../../data/seeds/yeasts.json" with { type: "json" };
import styles from "../../../data/seeds/styles.json" with { type: "json" };
import waterTargets from "../../../data/seeds/water_target_profiles.json" with { type: "json" };
import waterReports from "../../../data/seeds/water_reports.json" with { type: "json" };
import mashSchedules from "../../../data/seeds/mash-schedules.json" with { type: "json" };
import { ingestEquipment } from "./equipmentIngest.js";
import { CATALOGS } from "./userCatalog.js";
import { defaultBrewDayRows } from "../views/brewDay.js";

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
  sugars,
  yeasts,
  styles,
  waterTargets,
  waterReports,
  mashSchedules,
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

export function createReferenceCache() {
  const cache = {
    references: { ...BASE_REFERENCES },
    collections: {
      "grist.major_malts": DEFAULT_GRIST.map(buildGristRow),
      "grist.trace_malts": [],
      "mash.rests": mashSchedules["single-infusion"].rests,
      "batch.sugars": [],
      "batch.boil_hops": [],
      "batch.whirlpool_hops": [],
      "batch.dry_hops": [],
      "batch.brew_day_steps": defaultBrewDayRows(),
    },
    seeds: { ...BASE_SEEDS },
    libraryIds: new Set(),

    // Merge server library records into the live reference/seed maps in place.
    // The base maps are never mutated, so removing a record reveals the seed
    // again. The outer `references`/`seeds` objects keep their identity, so the
    // engine (which holds `references` by reference) sees the reassigned maps.
    syncLibraryItems(items) {
      const libraryIds = new Set();
      for (const [catalog, meta] of Object.entries(CATALOGS)) {
        const records = items?.[catalog] ?? {};
        for (const id of Object.keys(records)) libraryIds.add(id);
        if (meta.referencesKey) {
          this.references[meta.referencesKey] = {
            ...BASE_REFERENCES[meta.referencesKey],
            ...records,
          };
        }
        if (meta.seedKey) {
          this.seeds[meta.seedKey] = { ...BASE_SEEDS[meta.seedKey], ...records };
        }
      }
      this.libraryIds = libraryIds;
    },

    isLibraryItem(id) {
      return this.libraryIds.has(id);
    },
  };
  return cache;
}
