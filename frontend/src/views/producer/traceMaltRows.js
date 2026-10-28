// Trace-malts card readouts: the catalogue→draft row default. The drawer's
// subtitle and group lines are the malt catalogue's own display, shared with the
// grain bill (`gristRows.js`). Pure `(item) => …`; the card owns the drawer
// install, the slice lookup, and the engine refresh.

// Trace malts are dosed by mass, so the row carries the provenance and colour
// fields the boundary reads but no parts and no moisture.
export function makeTraceMaltRow(malt) {
  return {
    catalog_id: malt.id,
    name: malt.name,
    category: malt.category,
    mass_kg: 0,
    yield_fraction: malt.yield_fraction,
    yield_basis: malt.yield_basis,
    yield_provenance: malt.yield_provenance,
    fermentability_fraction: malt.fermentability_fraction,
    fermentability_provenance: malt.fermentability_provenance,
    fermentability_basis: malt.fermentability_basis,
    fermentability_method: malt.fermentability_method,
    color_lovibond: malt.color_lovibond,
    notes: malt.notes,
  };
}
