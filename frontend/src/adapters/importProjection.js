// Ledger → candidate batch state: the projection both the gate and the commit use.
//
// A projection is not a batch. It is the shaped state the engine would be built
// from if the user committed: roots the source stated, collections built through
// the very row builders the editor uses, and the yeast snapshot the source named.
// Identity-derived roots (conversion efficiency, losses, evaporation) are *not*
// set here — the session seeds those from the sealed identity, exactly as it does
// for a named batch, so there is one implementation of that rule.
//
// Two rules from the ledger survive projection:
// - `parts` is authored and `pct` is normalised here, once, per collection;
// - a source mass is converted to base units through the artifact's factors.

import artifact from "../engine/artifact.json" with { type: "json" };
import { toBase } from "../engine/units.js";
import { makeBoilRow } from "../views/producer/boilPolicy.js";
import { makeRow as makeMaltRow } from "./cards/malt.js";
import { makeRow as makeSugarRow } from "./cards/late-additions.js";
import { makeDryHopRow } from "./cards/dry-hops.js";
import { makeWhirlpoolRow } from "../views/producer/whirlpoolPolicy.js";
import { WHIRLPOOL_ROW_DEFAULTS } from "../views/registry/hops.js";
import { makeTraceMaltRow } from "../views/producer/traceMaltRows.js";
import { normalizedRowShares, rowDefaults } from "../views/producer/authoring.js";
import { gravityPointsToSg, massKg } from "../views/import/ledger.js";
import { catalogKindFor } from "../store/importMatch.js";

const MASS_UNITS = new Set(["g", "kg", "oz", "lb"]);
// The extraction's unit ids are lowercase; the artifact's are not. Map at the seam.
const VOLUME_UNIT = { l: "L", gal: "gal" };

export function projectImport({
  payload,
  ledger = [],
  identity = null,
  catalog = () => null,
  fraction = null,
  targetProfile = null,
}) {
  // A line whose registry record was deleted is not projectable: keeping it would
  // put an id on a root that no collection or selection can satisfy, and the solver
  // would report a dangling reference instead of the ledger finding that says so.
  const rows = ledger.filter((row) => row.decision === "mapped" && row.ref && resolvable(row, catalog));
  const roots = targetRoots(payload, rows);
  if (fraction != null) roots["batch.whirlpool_ibu_fraction"] = fraction;
  const collections = {
    "grist.major_malts": sharesOf(
      rows.filter((row) => row.destination === "grist.major_malts").map((row) => maltRow(row, catalog))
    ),
    "grist.trace_malts": rows
      .filter((row) => row.destination === "grist.trace_malts")
      .map((row) => traceRow(row, catalog)),
    "batch.sugars": sharesOf(
      rows.filter((row) => row.destination === "batch.sugars").map((row) => sugarRow(row, catalog))
    ),
    "batch.boil_hops": sharesOf(
      rows
        .filter((row) => row.destination === "batch.boil_hops")
        .map((row) => boilHopRow(row, catalog, roots["batch.boil_time_min"]))
    ),
    "batch.whirlpool_hops": sharesOf(
      rows
        .filter((row) => row.destination === "batch.whirlpool_hops")
        .map((row) => whirlpoolHopRow(row, catalog))
    ),
    "batch.dry_hops": rows
      .filter((row) => row.destination === "batch.dry_hops")
      .map((row) => dryHopRow(row, catalog)),
    "mash.rests": rows
      .filter((row) => row.destination === "mash.rests" && row.ref)
      .map((row) => mashRestRow(row)),
  };
  return {
    identity,
    roots: { ...roots, ...yeastRoot(rows), ...waterRoot(targetProfile) },
    collections: Object.fromEntries(
      Object.entries(collections).map(([nodeId, list]) => [nodeId, completeRows(nodeId, list)])
    ),
    selections: {
      ...yeastSelection(rows, catalog),
      ...waterSelection(targetProfile),
    },
  };
}

// A row built by a card carries the fields the builder names; the schema also
// declares defaults (a null cone utilization, an empty note). A partial row would
// make a boundary request non-canonicalisable, so every row gets the same
// defaults a blank editor row would.
function completeRows(nodeId, rows) {
  const schema = artifact.primitive_schemas[artifact.nodes[nodeId]?.item_schema] ?? null;
  if (!schema || !rows.length) return rows;
  return rows.map((row) => ({ ...rowDefaults(schema, artifact.taxonomies), ...row }));
}

function targetRoots(payload, rows) {
  const roots = {};
  set(roots, "batch.target_og", gravityPointsToSg(payload?.targets?.og));
  set(roots, "batch.target_ibu", payload?.targets?.ibu?.value);
  set(roots, "batch.v_ferm", volumeL(payload?.targets?.volume));
  set(roots, "batch.boil_time_min", payload?.targets?.boil_time_min?.value);
  set(roots, "batch.whirlpool_ibu_fraction", whirlpoolFraction(payload, rows));
  // The page's OG is the pin, so the grist moves and the strength is the page's.
  // Pinned to ABV instead, the solver would scale the bill to a strength that the
  // mapped yeast cannot reach, and the delta table would be comparing two beers.
  roots["batch.scale_pin"] = "og";
  return roots;
}

function set(roots, key, value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) roots[key] = value;
}

// Mash rests are not catalog records — the rest id is the whole name — and a line
// whose section has no catalog kind is taken at its word.
function resolvable(row, catalog) {
  if (row.section === "mashes") return true;
  const kind = catalogKindFor(row);
  return kind ? catalog(kind, row.ref) != null : true;
}

export function volumeL(target) {
  if (!target) return null;
  const unit = VOLUME_UNIT[target.unit];
  if (!unit) return null;
  return toBase(artifact, "volume", unit, target.value);
}

// The printed per-addition IBUs are the only exact way to split the pools. When
// the source gives them, the fraction is arithmetic; when it does not, the split
// stays an authored number and the review asks for it.
export function whirlpoolFraction(payload, rows) {
  const printed = rows
    .filter((row) => row.destination === "batch.whirlpool_hops" && row.ibu_contribution != null)
    .reduce((sum, row) => sum + row.ibu_contribution, 0);
  const total = payload?.targets?.ibu?.value;
  if (!(total > 0) || !(printed > 0)) return null;
  return Math.min(1, printed / total);
}

function maltRow(row, catalog) {
  const item = catalog("malt", row.ref);
  if (!item) return null;
  return { ...makeMaltRow(item), parts: partOf(row) };
}

function traceRow(row, catalog) {
  const item = catalog("malt", row.ref);
  if (!item) return null;
  return { ...makeTraceMaltRow(item), mass_kg: massKg(row.quantity) ?? 0 };
}

function sugarRow(row, catalog) {
  const item = catalog("sugar", row.ref);
  if (!item) return null;
  return { ...makeSugarRow(item), parts: partOf(row), mass_kg: massKg(row.quantity) ?? 0 };
}

function boilHopRow(row, catalog, boilMinutes) {
  const item = catalog("hop", row.ref);
  if (!item) return null;
  const minutes = row.minutes ?? 0;
  const fraction = boilMinutes > 0 ? Math.min(1, minutes / boilMinutes) : 1;
  return {
    ...makeBoilRow(item, row.product_form),
    parts: partOf(row),
    boil_time_fraction: fraction,
  };
}

function whirlpoolHopRow(row, catalog) {
  const item = catalog("hop", row.ref);
  if (!item) return null;
  const base = makeWhirlpoolRow(item, WHIRLPOOL_ROW_DEFAULTS, row.product_form);
  const temp = row.temperature;
  return {
    ...base,
    parts: partOf(row),
    initial_temp_c: temp ? celsius(temp) : base.initial_temp_c,
  };
}

function dryHopRow(row, catalog) {
  const item = catalog("hop", row.ref);
  if (!item) return null;
  const grams = (massKg(row.quantity) ?? 0) * 1000;
  return {
    ...makeDryHopRow(artifact, item),
    quantity: grams,
    unit: "g",
    contact_duration_min: row.duration_min ?? null,
  };
}

function mashRestRow(row) {
  return {
    rest_id: row.ref,
    enabled: true,
    use_temp_c: row.temperature ? celsius(row.temperature) : null,
    duration_min: row.duration_min ?? null,
  };
}

// A selection resolves through its ref root, so both must be set: the id the
// batch remembers and the snapshot it was chosen from.
function yeastSelection(rows, catalog) {
  const row = rows.find((candidate) => candidate.destination === "batch.yeast");
  const item = row ? catalog("yeast", row.ref) : null;
  return item ? { "batch.yeast": { ...item } } : {};
}

// The water target profile is a selection too, and it needs its ref root: a
// selection resolves through it, and without one the boundary has nothing to solve.
function waterSelection(profile) {
  if (!profile) return {};
  return { "water.target_profile": { ...profile } };
}

function waterRoot(profile) {
  return profile?.id ? { "water.target_profile_id": profile.id } : {};
}

function yeastRoot(rows) {
  const row = rows.find((candidate) => candidate.destination === "batch.yeast");
  return row?.ref ? { "batch.yeast_id": row.ref } : {};
}

function celsius(temperature) {
  return temperature.unit === "f" ? ((temperature.value - 32) * 5) / 9 : temperature.value;
}

function partOf(row) {
  if (MASS_UNITS.has(row.quantity?.unit)) return massKg(row.quantity) ?? 0;
  return row.quantity?.value ?? 0;
}

function sharesOf(rows) {
  const kept = rows.filter(Boolean);
  return kept.length ? normalizedRowShares(kept) : [];
}
