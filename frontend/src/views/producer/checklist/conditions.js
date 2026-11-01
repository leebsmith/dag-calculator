// Named checklist conditions. A condition decides whether a conditional step is
// present at critical/info, and whether it renders as N/A at debug.

import { BREW_DAY_NODES as N } from "../../registry/brew-day.js";

function list(engine, path) {
  const value = engine.get(path);
  return Array.isArray(value) ? value : [];
}

function enabledRests(engine) {
  return list(engine, N.rests).filter((rest) => rest?.enabled);
}

const CONDITIONS = {
  always: () => true,
  has_boil_hops: (engine) => list(engine, N.boilHops).length > 0,
  has_whirlpool_hops: (engine) => list(engine, N.whirlpoolHops).length > 0,
  has_dry_hops: (engine) => list(engine, N.dryHops).length > 0,
  has_late_sugar: (engine) => list(engine, N.sugars).length > 0,
  has_mash_out: (engine) => enabledRests(engine).some((rest) => rest.rest_id === "mash_out"),
  has_rests: (engine) =>
    enabledRests(engine).some((rest) => rest.rest_id !== "mash_out"),
  is_lager_or_mixed: (engine) => ["lager", "mixed"].includes(engine.get(N.fermentation)),
  has_water_target: (engine) => Boolean(engine.get(N.waterTarget)),
  has_yeast: (engine) => Boolean(engine.get(N.yeastId)),
};

export const CONDITION_IDS = Object.keys(CONDITIONS);

export function conditionHolds(id, engine) {
  if (!id) return true;
  const predicate = CONDITIONS[id];
  return predicate ? predicate(engine) : true;
}
