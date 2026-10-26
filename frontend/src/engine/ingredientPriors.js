// Ingredient-row resolution on ingest.
//
// A collection row that declares `yield_fraction` or `fermentability_fraction`
// is resolved from the artifact before the engine caches it: a captured value
// keeps its citation, and a missing one takes the artifact's category prior and
// is stamped `kind: "prior"`. That keeps every downstream consumer (boundary
// request, valuation, frozen bundle) working with complete figures, and records
// in the batch whether a number was measured or assumed.
//
// The engine owns this because "a collection row entering evaluation is
// resolved" is part of interpreting the artifact, not a UI concern: direct
// engine callers and tests get the same guarantee as the app.

const CATEGORY_SUFFIX = {
  BASE: "base",
  CRYSTAL: "crystal",
  ROASTED: "roasted",
  ACID: "acid",
};

function priorValue(artifact, prefix, suffix) {
  const id = `${prefix}_prior_${suffix}`;
  const value = artifact.constants?.[id]?.value;
  return typeof value === "number" ? { id, value } : null;
}

function priorProvenance(id) {
  return { bound: "point", kind: "prior", note: `resolved from ${id}` };
}

// Malts always carry a category. Sugars, extracts, and syrups are deliberately
// uncategorized (they are not mashed), so they take the sugar/extract priors.
function resolveRow(row, artifact) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  const suffix = out.category ? (CATEGORY_SUFFIX[out.category] ?? "default") : null;

  if (out.yield_fraction == null) {
    const resolved =
      (suffix && priorValue(artifact, "yield", suffix)) ??
      (suffix ? null : priorValue(artifact, "yield", "extract")) ??
      priorValue(artifact, "yield", "default");
    if (resolved) {
      out.yield_fraction = resolved.value;
      out.yield_provenance = priorProvenance(resolved.id);
    }
  }

  if (out.fermentability_fraction == null) {
    const resolved =
      (suffix && priorValue(artifact, "fermentability", suffix)) ??
      (suffix ? null : priorValue(artifact, "fermentability", "sugar")) ??
      priorValue(artifact, "fermentability", "default");
    if (resolved) {
      out.fermentability_fraction = resolved.value;
      out.fermentability_provenance = priorProvenance(resolved.id);
    }
  }

  return out;
}

// Only ingredient rows carry these figures; other collections pass through.
export function resolveIngredientRows(artifact, nodeId, rows) {
  const schema = artifact.primitive_schemas?.[artifact.nodes[nodeId]?.item_schema] ?? {};
  if (!("yield_fraction" in schema) && !("fermentability_fraction" in schema)) {
    return rows;
  }
  return (rows ?? []).map((row) => resolveRow(row, artifact));
}

// Mutates in place so the caller's collection object (shared with the session's
// draft state) observes the resolved rows.
export function resolveIngredientCollections(artifact, collections) {
  for (const nodeId of Object.keys(collections ?? {})) {
    collections[nodeId] = resolveIngredientRows(artifact, nodeId, collections[nodeId]);
  }
  return collections;
}
