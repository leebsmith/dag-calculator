// Candidate screening: the rest ranking for a mash step, and the string screen
// over the live catalogues. Pure — no state, no artifact reads beyond the rests
// seed, and it never invents a candidate it did not find.

import mashRests from "../../../../data/seeds/mash-rests.json" with { type: "json" };
import { filterCatalog } from "../catalog.js";

export const RESTS = Object.values(mashRests).sort((a, b) => a.sequence - b.sequence);

const SEARCH_FIELDS = {
  malt: ["name", "standard_name", "maltster", "notes"],
  sugar: ["name", "notes"],
  hop: ["name", "synonym", "notes"],
  yeast: ["name", "manufacturer", "notes"],
};

export function restCandidates(temperature, limit = 4) {
  const celsius = asCelsius(temperature);
  const ranked = RESTS.map((rest) => ({
    ...rest,
    distance: Number.isFinite(celsius) ? distanceTo(rest, celsius) : 99,
    width: rest.temp_max_c - rest.temp_min_c,
  })).sort(
    (a, b) => a.distance - b.distance || a.width - b.width || a.sequence - b.sequence
  );
  return ranked.slice(0, limit).map((rest) => ({
    rest_id: rest.rest_id,
    name: rest.name,
    detail: `${rest.temp_min_c}–${rest.temp_max_c} °C · ${rest.default_duration_min} min · ${rest.purpose}`,
  }));
}

function asCelsius(temperature) {
  if (temperature == null) return NaN;
  return temperature.unit === "f" ? ((temperature.value - 32) * 5) / 9 : temperature.value;
}

function distanceTo(rest, celsius) {
  if (celsius >= rest.temp_min_c && celsius <= rest.temp_max_c) return 0;
  return Math.min(
    Math.abs(celsius - rest.temp_min_c),
    Math.abs(celsius - rest.temp_max_c)
  );
}

export function proposeRest(row) {
  if (!Number.isFinite(asCelsius(row.temperature))) return null;
  return restCandidates(row.temperature, 1)[0] ?? null;
}

export function screenCandidates(text, items, catalogKind, limit = 5) {
  const fields = SEARCH_FIELDS[catalogKind] ?? ["name"];
  const ranked = filterCatalog(items ?? [], { query: text, searchFields: fields });
  return ranked.slice(0, limit);
}
