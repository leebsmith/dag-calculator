// Legacy draft migrations that need the live engine. Pure read/filter/write;
// no DOM and no UI state.

export function dropLegacyDoughIn(engine) {
  const rests = engine.get("mash.rests");
  if (!Array.isArray(rests)) return false;
  const filtered = rests.filter((rest) => rest?.rest_id !== "dough_in");
  if (filtered.length === rests.length) return false;
  engine.setCollection("mash.rests", filtered);
  return true;
}

export function migrateWhirlpoolCoordinates(engine) {
  const rows = engine.get("batch.whirlpool_hops");
  if (!Array.isArray(rows) || rows.length === 0) return false;
  if (rows.every((row) => row?.addition_at_min !== undefined)) return false;
  const durations = rows.map((row) => Number(row?.duration_min) || 0);
  const knockout = Math.max(...durations);
  const converted = rows.map((row, index) => {
    const next = { ...row };
    delete next.duration_min;
    next.addition_at_min = Math.max(0, knockout - durations[index]);
    return next;
  });
  engine.setCollection("batch.whirlpool_hops", converted);
  if (!engine.hasRoot("batch.whirlpool_knockout_min")) {
    engine.setRoot("batch.whirlpool_knockout_min", knockout);
  }
  return true;
}
