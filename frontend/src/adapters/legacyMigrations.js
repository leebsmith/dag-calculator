// Legacy draft migrations that need the live engine. The pure row filtering and
// conversion live in utils/migrationTransformers.js; this module performs the
// engine reads and writes.

import {
  convertWhirlpoolHopRows,
  filterDoughInRests,
} from "../utils/migrationTransformers.js";

export function dropLegacyDoughIn(engine) {
  const { rows, changed } = filterDoughInRests(engine.get("mash.rests"));
  if (!changed) return false;
  engine.setCollection("mash.rests", rows);
  return true;
}

export function migrateWhirlpoolCoordinates(engine) {
  const { rows, changed, knockout } = convertWhirlpoolHopRows(
    engine.get("batch.whirlpool_hops")
  );
  if (!changed) return false;
  engine.setCollection("batch.whirlpool_hops", rows);
  if (!engine.hasRoot("batch.whirlpool_knockout_min")) {
    engine.setRoot("batch.whirlpool_knockout_min", knockout);
  }
  return true;
}
