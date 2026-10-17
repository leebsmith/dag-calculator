// Pure reference-catalog filtering shared by the catalog-backed card editors.
// No adapter/engine dependencies: callers pass the catalog items plus the
// already-derived active ids / query / category selection.

export function filterCatalog(
  items,
  { activeIds = new Set(), query = "", categories = [], categoryOf = null } = {}
) {
  const q = String(query ?? "").trim().toLowerCase();
  const wanted = new Set(categories ?? []);
  return items.filter((item) => {
    if (activeIds.has(item.id)) return false;
    if (wanted.size > 0) {
      const category = categoryOf ? categoryOf(item) : null;
      if (!wanted.has(category)) return false;
    }
    if (q) {
      const haystack = `${item.name ?? ""} ${item.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function catalogCategories(items, categoryOf) {
  const seen = new Set();
  for (const item of items) {
    const category = categoryOf ? categoryOf(item) : null;
    if (category) seen.add(category);
  }
  return [...seen].sort();
}
