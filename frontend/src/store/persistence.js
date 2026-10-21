// Batch manager: the browser-side persistence seam. Owns the active batch
// (draft or frozen) and drives autosave / freeze / restore / trash. The step
// adapter is bound via `bindApp` so loads/autosaves can read + write its state.

import * as batchClient from "../adapters/batchClient.js";

let client = batchClient;
let app = null;
let active = null; // { id, name, status, trashed, persisted, updated_at }
let dirty = false; // unsaved edits since last successful sync
let saveTimer = null;

export function setClient(c) {
  client = c;
}

export function bindApp(stepApp) {
  app = stepApp;
}

export function getActive() {
  return active;
}

// Drop the active batch (sign-out / back to chooser). Also cancels a pending autosave.
export function clearActive() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  active = null;
  dirty = false;
}

export function list() {
  return client.listBatches();
}

// Create an untitled, unpersisted draft locally (client UUID). No network write
// happens until the first autosave. The editor is reset to empty state.
export async function createUntitled() {
  active = {
    id: crypto.randomUUID(),
    name: "Untitled recipe",
    status: "draft",
    trashed: false,
    persisted: false,
    updated_at: null,
  };
  dirty = false;
  await app?.loadState({ roots: {}, collections: {}, selections: {} });
  return active;
}

export async function open(batchId) {
  const b = await client.getBatch(batchId);
  active = {
    id: b.id,
    name: b.name,
    status: b.status,
    trashed: b.trashed ?? false,
    persisted: true,
    updated_at: b.updated_at,
  };
  dirty = false;
  await app?.loadState({
    roots: b.roots,
    collections: b.collections,
    selections: b.selections,
  });
  return b;
}

export async function renameActive(name) {
  if (!active || active.status !== "draft") return;
  active = { ...active, name };
  await saveNow();
}

// Fork a frozen batch into a new editable draft, preserving lineage and the
// frozen batch's copied-forward selections.
export async function fork(frozenId) {
  const frozen = await client.getBatch(frozenId);
  const created = await client.upsertBatch(crypto.randomUUID(), {
    name: `${frozen.name} (copy)`,
    parent_batch_id: frozen.id,
    roots: frozen.roots,
    collections: frozen.collections,
    selections: frozen.selections ?? {},
    schema_version: frozen.schema_version ?? 3,
  });
  active = {
    id: created.id,
    name: created.name,
    status: created.status,
    trashed: false,
    persisted: true,
    updated_at: created.updated_at,
  };
  dirty = false;
  await app?.loadState({
    roots: created.roots,
    collections: created.collections,
    selections: created.selections,
  });
  return created;
}

export async function freezeActive() {
  if (!active || active.status !== "draft") return;
  await client.freezeBatch(active.id, app.freezePayload());
}

export function queueSave({ delay = 400 } = {}) {
  if (!active || active.status !== "draft") return;
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveNow();
    } catch (err) {
      console.error("autosave failed", err);
    }
  }, delay);
}

// Flush pending edits immediately (used when navigating away).
export async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dirty) await saveNow();
}

// Move the active batch to trash and drop it. Unedited unpersisted drafts are
// simply abandoned (no zero-byte row); persisted/edited drafts are flushed then
// soft-deleted.
export async function trashActive() {
  if (!active) return;
  if (!active.persisted && !dirty) {
    clearActive();
    return;
  }
  await saveNow();
  await client.setTrashed(active.id, true);
  clearActive();
}

export function restore(batchId) {
  return client.setTrashed(batchId, false);
}

export async function trashBatch(batchId) {
  const record = await client.setTrashed(batchId, true);
  if (active?.id === batchId) clearActive();
  return record;
}

export async function renameBatch(batchId, name) {
  const record = await client.renameBatch(batchId, name);
  if (active?.id === batchId) active = { ...active, name: record.name };
  return record;
}

export function deletePermanent(batchId) {
  return client.deleteBatch(batchId);
}

async function saveNow() {
  if (!active || active.status !== "draft") return;
  const payload = { name: active.name, ...app.draftState() };
  try {
    const updated = await client.upsertBatch(active.id, payload, active.updated_at ?? undefined);
    active = { ...active, persisted: true, updated_at: updated.updated_at };
    dirty = false;
    return updated;
  } catch (err) {
    if (err?.code === "CONFLICT") {
      await reconcileConflict();
      return;
    }
    throw err;
  }
}

// Another session wrote after our last observation: drop our local edits and
// re-hydrate from the latest remote state (the full merge lands with M3).
async function reconcileConflict() {
  const b = await client.getBatch(active.id);
  active = {
    ...active,
    name: b.name,
    status: b.status,
    trashed: b.trashed ?? false,
    persisted: true,
    updated_at: b.updated_at,
  };
  dirty = false;
  await app?.loadState({
    roots: b.roots,
    collections: b.collections,
    selections: b.selections,
  });
}
