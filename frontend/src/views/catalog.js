// Pure reference-catalog filtering + standard grouping, shared by the
// catalog-backed card editors. No adapter/engine dependencies: callers pass the
// catalog items plus the already-derived active ids / query / filters.

// Canonical display order of the standard-malt families (matches
// standard-malts.md). Unknown families sort after these.
export const FAMILY_ORDER = [
  "base",
  "kilned",
  "toasted",
  "crystal",
  "roasted",
  "dehusked",
  "smoked",
  "peated",
  "acidulated",
  "chit",
  "dextrin",
  "flaked",
  "raw",
  "adjunct",
];

const FAMILY_LABELS = {
  base: "Base",
  kilned: "Kilned",
  toasted: "Toasted",
  crystal: "Crystal",
  roasted: "Roasted",
  dehusked: "Dehusked",
  smoked: "Smoked",
  peated: "Peated",
  acidulated: "Acidulated",
  chit: "Chit",
  dextrin: "Dextrin",
  flaked: "Flaked",
  raw: "Raw / Torrefied",
  adjunct: "Adjunct",
};

export function familyLabel(family) {
  return FAMILY_LABELS[family] ?? family;
}

// Relevance for a text query: name-prefix beats word-prefix beats name-substring
// beats a match in another field, and a match found only in prose notes ranks
// last. Ties are broken by name so a short query still reads alphabetically.
function primaryScore(value, q) {
  if (!value) return null;
  if (value.startsWith(q)) return 0;
  if (value.split(/\s+/).some((word) => word.startsWith(q))) return 1;
  if (value.includes(q)) return 2;
  return null;
}

function matchRank(item, q, fields) {
  const primary = fields.includes("name") ? "name" : fields[0];
  const score = primaryScore(String(item?.[primary] ?? "").toLowerCase(), q);
  if (score != null) return score;

  let best = null;
  for (const field of fields) {
    if (field === primary) continue;
    const value = String(item?.[field] ?? "").toLowerCase();
    if (!value.includes(q)) continue;
    const rank = field === "notes" ? 4 : 3;
    best = best == null ? rank : Math.min(best, rank);
  }
  return best;
}

export function filterCatalog(
  items,
  {
    activeIds = new Set(),
    query = "",
    categories = [],
    categoryOf = null,
    searchFields = ["name", "notes"],
    includeNotes = true,
  } = {}
) {
  const q = String(query ?? "").trim().toLowerCase();
  const wanted = new Set(categories ?? []);
  const fields = includeNotes ? searchFields : searchFields.filter((field) => field !== "notes");
  const eligible = items.filter((item) => {
    if (activeIds.has(item.id)) return false;
    if (wanted.size > 0) {
      const category = categoryOf ? categoryOf(item) : null;
      if (!wanted.has(category)) return false;
    }
    return true;
  });
  if (!q) return eligible;

  return eligible
    .map((item) => ({ item, rank: matchRank(item, q, fields) }))
    .filter((row) => row.rank != null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        String(a.item?.name ?? "").localeCompare(String(b.item?.name ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        })
    )
    .map((row) => row.item);
}

export function catalogCategories(items, categoryOf) {
  const seen = new Set();
  for (const item of items) {
    const category = categoryOf ? categoryOf(item) : null;
    if (category) seen.add(category);
  }
  return [...seen].sort();
}

// Distinct families present in `items`, ordered by FAMILY_ORDER, with counts.
export function familyOptions(items, familyOf = (i) => i.family) {
  const counts = new Map();
  for (const item of items) {
    const family = familyOf(item);
    if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  const ordered = [];
  const seen = new Set();
  for (const family of [...FAMILY_ORDER, ...counts.keys()]) {
    if (!counts.has(family) || seen.has(family)) continue;
    seen.add(family);
    ordered.push({ name: family, label: familyLabel(family), count: counts.get(family) });
  }
  return ordered;
}

// Group `items` by standard class, ordered by family then member count (desc)
// then name. Each group carries the class's id/name/description/family/count,
// read from the items themselves (consistent within a group by construction).
export function standardGroups(
  items,
  { idOf, nameOf, descriptionOf, familyOf } = {}
) {
  const idFn = idOf ?? ((i) => i.standard_malt);
  const nameFn = nameOf ?? ((i) => i.standard_name);
  const descFn = descriptionOf ?? ((i) => i.generic_description);
  const famFn = familyOf ?? ((i) => i.family);

  const groups = new Map();
  for (const item of items) {
    const id = idFn(item);
    if (!id) continue;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name: nameFn(item) ?? id,
        description: descFn(item) ?? "",
        family: famFn(item) ?? "",
        count: 0,
      });
    }
    groups.get(id).count += 1;
  }

  const familyRank = (f) => {
    const i = FAMILY_ORDER.indexOf(f);
    return i === -1 ? FAMILY_ORDER.length : i;
  };
  return [...groups.values()].sort(
    (a, b) =>
      familyRank(a.family) - familyRank(b.family) ||
      b.count - a.count ||
      String(a.name).localeCompare(String(b.name))
  );
}
