// Batch manager: the browser-side persistence seam. Owns the active batch
// (draft or frozen) and drives autosave / freeze / restore. The step adapter
// is bound via `bindApp` so loads/autosaves can read + write its state.

import { createBatch, freezeBatch, getBatch, listBatches, updateDraft } from "../adapters/batchClient.js";

let app = null;
let active = null; // { id, name, status }
let saveTimer = null;

export function bindApp(stepApp) {
  app = stepApp;
}

export function getActive() {
  return active;
}

export function list() {
  return listBatches();
}

export async function createDraft(name = "Untitled") {
  const created = await createBatch({ name });
  active = { id: created.id, name: created.name, status: created.status };
  app?.loadState({ roots: created.roots, collections: created.collections, overlays: created.overlays });
  return created;
}

export async function open(batchId) {
  const b = await getBatch(batchId);
  active = { id: b.id, name: b.name, status: b.status };
  app?.loadState({ roots: b.roots, collections: b.collections, overlays: b.overlays });
  return b;
}

export async function renameActive(name) {
  if (!active || active.status !== "draft") return;
  active = { ...active, name };
  await updateDraft(active.id, { name, ...app.draftState() });
}

// Fork a frozen batch into a new editable draft, preserving lineage.
export async function fork(frozenId) {
  const frozen = await getBatch(frozenId);
  const created = await createBatch({
    name: `${frozen.name} (copy)`,
    parent_batch_id: frozen.id,
    roots: frozen.roots,
    collections: frozen.collections,
    overlays: frozen.overlays,
  });
  active = { id: created.id, name: created.name, status: created.status };
  app?.loadState({ roots: created.roots, collections: created.collections, overlays: created.overlays });
  return created;
}

export async function freezeActive() {
  if (!active || active.status !== "draft") return;
  await freezeBatch(active.id, app.freezePayload());
}

export function queueSave({ delay = 400 } = {}) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!active || active.status !== "draft") return;
    try {
      await updateDraft(active.id, { name: active.name, ...app.draftState() });
    } catch (err) {
      console.error("autosave failed", err);
    }
  }, delay);
}
