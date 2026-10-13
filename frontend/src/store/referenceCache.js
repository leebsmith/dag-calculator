// Reference cache: immutable seed data resolved by id (seed-substrate.md).
// Every catalog seed is a flat id-keyed map of schema-conforming components
// (normalized in Step G), so no per-file adapters are needed here.

import equipment from "../../../data/seeds/equipment.json" with { type: "json" };
import malts from "../../../data/seeds/malts.json" with { type: "json" };
import sugars from "../../../data/seeds/sugars.json" with { type: "json" };
import yeasts from "../../../data/seeds/yeasts.json" with { type: "json" };
import waterTargets from "../../../data/seeds/water_target_profiles.json" with { type: "json" };
import waterReports from "../../../data/seeds/water_reports.json" with { type: "json" };
import mashSchedules from "../../../data/seeds/mash-schedules.json" with { type: "json" };

const DEFAULT_GRIST = [
  { catalog_id: "pilsner", pct: 0.8, parts: 80 },
  { catalog_id: "crystal-40", pct: 0.2, parts: 20 },
];

function buildGristRow(entry) {
  const malt = malts[entry.catalog_id];
  return {
    catalog_id: entry.catalog_id,
    name: malt.name,
    category: malt.category,
    parts: entry.parts,
    pct: entry.pct,
    yield_fraction: malt.yield_fraction,
    color_lovibond: malt.color_lovibond,
    moisture_pct: malt.moisture_pct,
  };
}

export function createReferenceCache() {
  return {
    references: {
      equipment,
      yeast: yeasts,
      water_report: waterReports,
      water_target: waterTargets,
    },
    collections: {
      "grist.major_malts": DEFAULT_GRIST.map(buildGristRow),
      "mash.rests": mashSchedules["single-infusion"].rests,
      "batch.sugars": [],
    },
    seeds: {
      equipment,
      malts,
      sugars,
      yeasts,
      waterTargets,
      waterReports,
      mashSchedules,
    },
  };
}
