// Boil product-form policy: the extract's T-90 substitution equivalent and its
// dose ceiling. The boil is the only place an extract can be added, so both live
// here rather than on the whirlpool card.

// Flowable extracts saturate the wort: above roughly 4 g/gal the product stops
// dispersing and degrades foam. The supplier ceilings are informational until
// dose is modelled, so the card keeps this generic bound.
export function doseWarning(rows, formatNumber, doseOf) {
  const doses = (rows ?? [])
    .filter((row) => row.product_form === "flowable_extract")
    .map(doseOf)
    .filter((dose) => typeof dose === "number" && Number.isFinite(dose));
  if (!doses.length) return "";
  const worst = Math.max(...doses);
  return worst > 4
    ? `Flowable extract dose ${formatNumber(worst, 2)} g/gal exceeds the 4 g/gal saturation ceiling.`
    : "";
}

// A boil row is seeded from the catalog entry. The catalog form wins when the
// brewer picked from a form-filtered list, because a variety carries no form of
// its own; an extract defaults to a late addition rather than a full boil.
export function makeBoilRow(hop, catalogForm = null) {
  const productForm = catalogForm ?? hop.product_form ?? "t90_pellet";
  return {
    hop_id: hop.id,
    name: hop.name,
    product_form: productForm,
    alpha_acid_pct: hop.alpha_acid_pct,
    boil_time_fraction: productForm === "flowable_extract" ? 0.25 : 1,
    parts: 10,
    pct: 0,
  };
}

