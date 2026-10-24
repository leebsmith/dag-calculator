// Batch manager: the browser-side persistence seam. Owns the active batch
// (draft or frozen) and drives autosave / freeze / restore / trash. The step
// adapter is bound via `bindApp` so loads/autosaves can read + write its state.

import * as batchClient from "../adapters/batchClient.js";
import { DRAFT_SCHEMA_VERSION } from "./snapshot.js";

let client = batchClient;
let app = null;
let active = null; // { id, name, status, trashed, persisted, updated_at }
let dirty = false; // unsaved edits since last successful sync
let saveTimer = null;
let saveState = "idle"; // "idle" | "dirty" | "saving" | "error" | "conflict"
let conflictRemote = null; // authoritative record returned with a 409
let onStateChange = null; // observer: ({ state, conflictRemote }) => void
let retryDelays = [1000, 2000, 4000]; // exponential backoff between retries

function setSaveState(state) {
  saveState = state;
  onStateChange?.({ state, conflictRemote });
}

export function setStateObserver(fn) {
  onStateChange = fn;
}

export function setRetryDelays(delays) {
  retryDelays = delays;
}

export function getSaveState() {
  return saveState;
}

export function getConflictRemote() {
  return conflictRemote;
}

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
  conflictRemote = null;
  setSaveState("idle");
}

export function list() {
  return client.listBatches();
}

// Create an untitled, unpersisted draft locally (client UUID). No network write
// happens until the first autosave. The editor is reset to empty state.
export class UnsupportedBatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedBatchError";
  }
}

// A batch must carry its identity and a payload revision this build understands.
// Old records are not migrated: they cannot be interpreted, and silently booting
// them with an empty identity would render blank values as if they were unset.
function assertSupported(record) {
  if (!record.identity || !record.identity.equipment || !record.identity.style) {
    throw new UnsupportedBatchError(
      "This batch predates the identity model and cannot be opened. Create a new batch."
    );
  }
  if (record.schema_version !== undefined && record.schema_version !== DRAFT_SCHEMA_VERSION) {
    throw new UnsupportedBatchError(
      `This batch was saved with payload schema ${record.schema_version}; this build reads ${DRAFT_SCHEMA_VERSION}.`
    );
  }
}

export async function createWithIdentity({ name, identity }) {
  active = {
    id: crypto.randomUUID(),
    name: name || "Untitled batch",
    status: "draft",
    trashed: false,
    persisted: false,
    updated_at: null,
  };
  dirty = false;
  conflictRemote = null;
  setSaveState("idle");
  await app?.loadState({ identity, roots: {}, collections: {}, selections: {} });
  dirty = true;
  await saveNow();
  return active;
}

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
  conflictRemote = null;
  setSaveState("idle");
  await app?.loadState({ roots: {}, collections: {}, selections: {} });
  return active;
}

export async function open(batchId) {
  const b = await client.getBatch(batchId);
  assertSupported(b);
  active = {
    id: b.id,
    name: b.name,
    status: b.status,
    trashed: b.trashed ?? false,
    persisted: true,
    updated_at: b.updated_at,
  };
  dirty = false;
  conflictRemote = null;
  setSaveState("idle");
  await app?.loadState({
    ...(b.identity ? { identity: b.identity } : {}),
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
  assertSupported(frozen);
  const created = await client.upsertBatch(crypto.randomUUID(), {
    name: `${frozen.name} (copy)`,
    parent_batch_id: frozen.id,
    parent_name: frozen.name,
    identity: frozen.identity,
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
  conflictRemote = null;
  setSaveState("idle");
  await app?.loadState({
    ...(created.identity ? { identity: created.identity } : {}),
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
  setSaveState("dirty");
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

export async function saveNow({ force = false } = {}) {
  if (!active || active.status !== "draft") return;
  let lastError;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    setSaveState("saving");
    const payload = { name: active.name, ...app.draftState() };
    try {
      const updated = await client.upsertBatch(
        active.id,
        payload,
        active.updated_at ?? undefined,
        force
      );
      active = { ...active, persisted: true, updated_at: updated.updated_at };
      dirty = false;
      conflictRemote = null;
      setSaveState("idle");
      return updated;
    } catch (err) {
      if (err?.code === "CONFLICT") {
        markConflict(err.details?.current ?? null);
        return;
      }
      lastError = err;
      if (attempt < retryDelays.length) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  }
  setSaveState("error");
  throw lastError;
}

// Another session wrote after our last observation. Preserve the local edits:
// record the authoritative remote snapshot and surface a "conflict" state for
// the UI to resolve (reload remote, or force-save our copy). Never loadState
// here — that would silently discard the user's work.
function markConflict(remote) {
  conflictRemote = remote;
  setSaveState("conflict");
}

// Resolve a conflict by discarding local edits and re-hydrating from the
// authoritative remote record the server returned with the 409.
export async function resolveConflictByReload() {
  const remote = conflictRemote;
  if (!remote) return;
  active = {
    id: remote.id,
    name: remote.name,
    status: remote.status,
    trashed: remote.trashed ?? false,
    persisted: true,
    updated_at: remote.updated_at,
  };
  dirty = false;
  conflictRemote = null;
  setSaveState("idle");
  await app?.loadState({
    ...(remote.identity ? { identity: remote.identity } : {}),
    roots: remote.roots,
    collections: remote.collections,
    selections: remote.selections,
  });
}
