// Boil product-form policy: the extract's T-90 substitution equivalent and its
// dose ceiling. The boil is the only place an extract can be added, so both live
// here rather than on the whirlpool card.

import { isFiniteNumber } from "../../utils.js";

const L_PER_GAL = 3.785411784;

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

// A boil row is seeded from the catalog entry: the form travels with the pick,
// and an extract defaults to a late addition rather than a full boil.
export function makeBoilRow(hop) {
  const productForm = hop.product_form ?? "t90_pellet";
  const row = {
    hop_id: hop.id,
    name: hop.name,
    product_form: productForm,
    alpha_acid_pct: hop.alpha_acid_pct,
    boil_time_fraction: productForm === "flowable_extract" ? 0.25 : 1,
    parts: 10,
    pct: 0,
  };
  if (isFiniteNumber(hop.t90_replacement_ratio)) {
    row.t90_replacement_ratio = hop.t90_replacement_ratio;
  }
  return row;
}

export function boilPolicyDescriptors({ formatMass, formatNumber, postBoilVolume }) {
  const doseOf = (row) => {
    const volume = postBoilVolume();
    if (!isFiniteNumber(row.mass_kg) || !(volume > 0)) return null;
    return (row.mass_kg * 1000) / (volume / L_PER_GAL);
  };
  return {
    hopDoseWarning: {
      configurable: true,
      get() {
        return doseWarning(this.hopRows, formatNumber, doseOf);
      },
    },
    // Display-only: what this extract charge would be if dosed as T-90 by weight.
    hopT90Equivalent: {
      configurable: true,
      get() {
        const row = this.hopActiveRow;
        if (
          !row ||
          row.product_form !== "flowable_extract" ||
          !isFiniteNumber(row.t90_replacement_ratio)
        ) {
          return "";
        }
        const saved = this.hopRows[this.hopActiveIndex];
        if (!isFiniteNumber(saved?.mass_kg)) return "";
        const equivalent = saved.mass_kg * row.t90_replacement_ratio;
        return `${formatMass(equivalent, "g")} T-90 equivalent (1:${row.t90_replacement_ratio})`;
      },
    },
  };
}
