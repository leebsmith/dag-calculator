// Which blend record represents the imported recipe's strains?
//
// A multi-strain recipe is a blend, but the blend is a Library record authored there
// (name + composition + attenuation). The import never writes one; it ranks the
// existing blends against the recipe's own strain names, so the candidates are
// blends rather than the components. Pure: no state, no catalog reads.

const STOPWORDS = new Set([
  "blend", "of", "the", "and", "a", "an", "strain", "strains", "culture", "cultures",
  "yeast", "yeasts", "labs", "lab", "company", "co",
]);

function tokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

// How many of the recipe's strain words the blend's text mentions. A name with the
// strain code ("3724") scores like the name with the lab.
export function blendScore(blend, strainNames = []) {
  const haystack = new Set(tokens([blend?.blend_of, blend?.name].join(" ")));
  let score = 0;
  for (const name of strainNames) {
    for (const token of tokens(name)) if (haystack.has(token)) score += 1;
  }
  return score;
}

// Best first, then alphabetical so the list is stable between renders. Blends with no
// overlap stay in the list, last: the user may have named them independently.
export function rankBlends(blends = [], strainNames = [], limit = 4) {
  return blends
    .map((blend) => ({ blend, score: blendScore(blend, strainNames) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.blend?.name ?? "").localeCompare(String(b.blend?.name ?? ""))
    )
    .slice(0, limit)
    .map(({ blend }) => blend);
}
