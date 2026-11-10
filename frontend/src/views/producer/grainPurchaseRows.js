// Grain and sugar shopping quantities. The buy rule matches the hop purchases:
// round up to the next whole ounce, then print pounds and ounces for anything a
// pound or larger. Rows are aggregated by fermentable so a malt split across the
// bill and the trace additions becomes one purchase line.

import { toBase } from "../../engine/index.js";
import { nonlinearFns } from "../producer.js";

const KIND_ORDER = { Grain: 0, Sugar: 1 };

function buyLabel(buyOz) {
  const lb = Math.floor(buyOz / 16);
  const oz = buyOz - lb * 16;
  return lb >= 1 ? `${lb} lb ${oz} oz` : `${oz} oz`;
}

export function grainPurchaseRows({ artifact, engine, fermentables }) {
  const nl = nonlinearFns(artifact, engine);
  const ozKg = toBase(artifact, "mass", "oz", 1, nl);
  const groups = new Map();

  const add = (row, mass, kind) => {
    const key = `${kind}:${row.catalog_id ?? row.sugar_id ?? row.name}`;
    const entry = groups.get(key) ?? { name: String(row.name ?? ""), kind, kg: 0 };
    entry.kg += mass;
    groups.set(key, entry);
  };

  for (const item of fermentables.major) add(item.row, item.mass, "Grain");
  for (const item of fermentables.trace) add(item.row, item.mass, "Grain");
  for (const item of fermentables.sugar) add(item.row, item.mass, "Sugar");

  return [...groups.values()]
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
    .map((group) => {
      const buyOz = Math.ceil(group.kg / ozKg - 1e-9);
      return {
        name: { text: group.name },
        kind: { text: group.kind },
        buy: { text: buyLabel(buyOz) },
      };
    });
}
