// Legacy draft migrations that need the live engine. The pure row filtering and
// conversion live in utils/migrationTransformers.js; this module performs the
// engine reads and writes.

import {
  convertWhirlpoolHopRows,
  filterDoughInRests,
} from "../utils/migrationTransformers.js";
import { migrateLegacyRows } from "../views/dryHopSchedule.js";

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

export function migrateDryHopSchedule(engine) {
  const rows = engine.getAuthored("batch.dry_hops");
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const migrated = migrateLegacyRows(rows);
  const changed = migrated.some(
    (row, index) => JSON.stringify(row) !== JSON.stringify(rows[index])
  );
  if (changed) engine.setCollection("batch.dry_hops", migrated);
  return changed;
}
