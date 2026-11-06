import { toBase } from "../../engine/index.js";
import { nonlinearFns } from "../producer.js";
import { HOP_NODES as H } from "../registry/hops.js";
import { DRY_HOP_NODES as D } from "../registry/dry-hops.js";
import { dryHopPurchaseRow, hopPurchaseGroups } from "./hopPurchases.js";

function massOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hopPurchaseRows({ artifact, catalog, engine, resolvedList, formatEntry }) {
  const nl = nonlinearFns(artifact, engine);
  const nodes = catalog.nodes ?? {};
  const ozKg = toBase(artifact, "mass", "oz", 1, nl);
  const massEntry = { dimension: "mass", unit: "oz", symbol: "oz", decimals: 0 };
  const volumeEntry = { dimension: "volume", unit: "ml", symbol: "ml", decimals: 0 };
  const formEntry =
    nodes[`${H.collection}.product_form`] ?? nodes[`${H.whirlpoolCollection}.product_form`];
  const boil = engine.get(H.collection) ?? [];
  const boilSolved = resolvedList(engine, H.boilRows);
  const whirlpool = engine.get(H.whirlpoolCollection) ?? [];
  const whirlpoolSolved = resolvedList(engine, H.whirlpoolRows);
  const dry = engine.get(D.collection) ?? [];
  const rows = [
    ...boil.map((row, index) => ({
      id: row.hop_id,
      name: row.name,
      form: row.product_form ?? "t90_pellet",
      massKg: massOrNull(boilSolved[index]?.mass_kg),
    })),
    ...whirlpool.map((row, index) => ({
      id: row.hop_id,
      name: row.name,
      form: row.product_form ?? "t90_pellet",
      massKg: massOrNull(whirlpoolSolved[index]?.mass_kg),
    })),
    ...dry.map((row) =>
      dryHopPurchaseRow(row, (quantity, unit) =>
        toBase(artifact, "mass", unit, quantity, nl)
      )
    ),
  ];
  return hopPurchaseGroups(rows).map((group) => {
    let purchase = { text: "—" };
    if (group.basis === "mass") {
      const buyOz = Math.ceil(group.totalKg / ozKg - 1e-9);
      purchase = formatEntry(artifact, massEntry, buyOz * ozKg, nl);
    } else if (group.basis === "volume") {
      purchase = formatEntry(
        artifact,
        volumeEntry,
        toBase(artifact, "volume", "ml", group.totalMl, nl),
        nl
      );
    }
    return {
      name: { text: group.name },
      form: formEntry ? formatEntry(artifact, formEntry, group.form, nl) : { text: group.form },
      purchase,
    };
  });
}
