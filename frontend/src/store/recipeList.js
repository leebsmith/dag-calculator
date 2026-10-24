// Pure list shaping for the Batches view. No DOM, no store state — the store
// composes these helpers so the scope/sort rules stay testable.

import { formatDate } from "../utils.js";

export const BATCH_SCOPES = ["all", "drafts", "frozen", "trash"];

export const SCOPE_LABELS = {
  all: "All",
  drafts: "Drafts",
  frozen: "Frozen",
  trash: "Trash",
};

function updatedMs(batch) {
  return typeof batch?.updated_at === "number" ? batch.updated_at * 1000 : 0;
}

function titleCompare(a, b) {
  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function byModified(a, b) {
  return updatedMs(b) - updatedMs(a) || titleCompare(a, b);
}

function byTitle(a, b) {
  return titleCompare(a, b) || updatedMs(b) - updatedMs(a);
}

export function isFrozen(batch) {
  return batch?.status === "frozen";
}

export function isTrashed(batch) {
  return batch?.trashed === true;
}

export function sortBatches(batches, sort = "modified") {
  return [...batches].sort(sort === "title" ? byTitle : byModified);
}

// Scope is the only partition: trash is a scope, not a separate screen, and
// frozen is a status filter rather than a destination.
export function batchesForScope(batches, scope = "all", { sort = "modified" } = {}) {
  const rows = (batches ?? []).filter((batch) => {
    if (scope === "trash") return isTrashed(batch);
    if (isTrashed(batch)) return false;
    if (scope === "drafts") return !isFrozen(batch);
    if (scope === "frozen") return isFrozen(batch);
    return true;
  });
  return sortBatches(rows, sort);
}

// The identity snapshot is a copy, so a row shows its labels as text. Namespaces
// are `style`, `equipment`, and `water.source`.
export function identityLabel(batch, namespace, field = "name") {
  const component = batch?.identity?.[namespace];
  if (!component) return "";
  return component[field] || component.laboratory || component.id || component.report_id || "";
}

export function parentLabel(batch) {
  return batch?.parent_name || "";
}

export { formatDate };
