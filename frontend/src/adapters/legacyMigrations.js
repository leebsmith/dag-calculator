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
