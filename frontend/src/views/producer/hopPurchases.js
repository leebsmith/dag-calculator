// Purchasing groups: collapse every hop use in the recipe to one line per
// identical product, summing resolved masses and keeping unresolved and volume
// lines separate. Pure over normalised rows; the report formatter owns unit
// conversion and display rounding.

const MASS_UNITS = new Set(["g", "oz"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function groupKey(id, form, basis) {
  return `${id}\u0000${form}\u0000${basis}`;
}

function blankGroup(row, basis) {
  return {
    id: row.id,
    name: row.name,
    form: row.form,
    basis,
    totalKg: 0,
    totalMl: 0,
    resolved: false,
  };
}

function dryHopBase(row) {
  return {
    id: row?.hop_id,
    name: row?.variety ?? row?.name,
    form: row?.product_type ?? "t90_pellet",
  };
}

export function dryHopPurchaseRow(row, massKgOf) {
  const base = dryHopBase(row);
  const quantity = Number(row?.quantity);
  if (!Number.isFinite(quantity)) return { ...base, massKg: null };
  const unit = row?.unit ?? "g";
  if (unit === "ml") return { ...base, volumeMl: quantity };
  if (!MASS_UNITS.has(unit)) return { ...base, massKg: null };
  return { ...base, massKg: massKgOf(quantity, unit) };
}

function nonEmpty(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function rowBasis(mass, volume) {
  if (mass != null) return "mass";
  if (volume != null) return "volume";
  return "unresolved";
}

function normaliseRow(row) {
  const name = nonEmpty(row?.name, "Unknown hop");
  const form = nonEmpty(row?.form, "t90_pellet");
  const id = nonEmpty(row?.id, name.toLowerCase());
  const mass = finite(row?.massKg) ? row.massKg : null;
  const volume = finite(row?.volumeMl) ? row.volumeMl : null;
  return { id, name, form, mass, volume, basis: rowBasis(mass, volume) };
}

function addToGroup(groups, row) {
  if (row.mass === 0 || row.volume === 0) return;
  const key = groupKey(row.id, row.form, row.basis);
  const group = groups.get(key) ?? blankGroup(row, row.basis);
  if (row.basis === "mass") {
    group.totalKg += row.mass;
    group.resolved = true;
  } else if (row.basis === "volume") {
    group.totalMl += row.volume;
    group.resolved = true;
  }
  groups.set(key, group);
}

function sortGroups(groups) {
  const order = { mass: 0, volume: 1, unresolved: 2 };
  return groups
    .filter((group) => group.basis === "unresolved" || group.resolved)
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.form.localeCompare(right.form) ||
        order[left.basis] - order[right.basis]
    );
}

export function hopPurchaseGroups(rows) {
  const groups = new Map();
  for (const row of rows ?? []) addToGroup(groups, normaliseRow(row));
  return sortGroups([...groups.values()]);
}
