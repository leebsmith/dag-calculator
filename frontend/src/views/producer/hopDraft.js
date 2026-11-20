import { HOP_NODES as H } from "../registry/hops.js";
import { normalizedMassShares } from "./authoring.js";
import { hopShareFields, HOP_SHARE_FIELDS } from "./hopShareFields.js";

export function hopDraftEntry(entry, mode) {
  const share = hopShareFields(mode);
  const base = (entry.columns ?? []).filter((column) => !HOP_SHARE_FIELDS.includes(column));
  const inputs = new Set(entry.inputs ?? []);
  for (const field of HOP_SHARE_FIELDS) inputs.delete(field);
  inputs.add(share.shareId);
  return {
    ...entry,
    columns: [...base, share.shareId, share.derivedId],
    inputs: [...inputs],
  };
}

export function normalizeHopDraft({ nodeId, rows, engine }) {
  if (nodeId !== H.collection && nodeId !== H.whirlpoolCollection) return null;
  if (engine.get(H.allocationMode) !== "mass_pool") return null;
  const boil = nodeId === H.collection ? rows : engine.get(H.collection) ?? [];
  const whirlpool =
    nodeId === H.whirlpoolCollection ? rows : engine.get(H.whirlpoolCollection) ?? [];
  const normalized = normalizedMassShares(boil, whirlpool);
  const current = nodeId === H.collection ? normalized.boil : normalized.whirlpool;
  rows.forEach((row, index) => {
    row.mass_pct = current[index]?.mass_pct;
  });
  return rows;
}
