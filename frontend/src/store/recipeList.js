// Pure list shaping for the recipe landing page. No DOM, no store state — the
// store composes these helpers so the partition/sort rules stay testable.

import { formatDate } from "../utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_WINDOW_DAYS = 30;
export const FREEZE_RAIL_LIMIT = 6;

export { formatDate };

function updatedMs(batch) {
  return typeof batch?.updated_at === "number" ? batch.updated_at * 1000 : 0;
}

function frozenMs(batch) {
  if (typeof batch?.frozen_at === "number") return batch.frozen_at * 1000;
  return updatedMs(batch);
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

export function draftBatches(batches) {
  return (batches ?? []).filter((b) => !isFrozen(b) && !isTrashed(b));
}

export function frozenBatches(batches) {
  return (batches ?? [])
    .filter((b) => isFrozen(b) && !isTrashed(b))
    .sort((a, b) => frozenMs(b) - frozenMs(a) || titleCompare(a, b));
}

export function recentFreezes(batches, limit = FREEZE_RAIL_LIMIT) {
  return frozenBatches(batches).slice(0, Math.max(0, limit));
}

export function trashedBatches(batches) {
  return (batches ?? [])
    .filter(isTrashed)
    .sort((a, b) => updatedMs(b) - updatedMs(a) || titleCompare(a, b));
}

export function sortBatches(batches, sort = "modified") {
  return [...batches].sort(sort === "title" ? byTitle : byModified);
}

export function draftSections(
  batches,
  { now = Date.now(), sort = "modified", windowDays = RECENT_WINDOW_DAYS } = {}
) {
  const cutoff = now - windowDays * DAY_MS;
  const recent = [];
  const older = [];
  for (const batch of draftBatches(batches)) {
    if (updatedMs(batch) >= cutoff) recent.push(batch);
    else older.push(batch);
  }
  return [
    { key: "recent", label: `Last ${windowDays} days`, batches: sortBatches(recent, sort) },
    { key: "older", label: "Older", batches: sortBatches(older, sort) },
  ].filter((section) => section.batches.length);
}
