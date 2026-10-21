// Batch (draft/frozen) persistence client over the JSON seam. Browser-only —
// not imported by node tests.

import { requestJSON } from "./apiClient.js";

export function listBatches() {
  return requestJSON("/batches");
}

export function upsertBatch(batchId, payload, baseUpdatedAt, force = false) {
  const body = { ...payload };
  if (baseUpdatedAt !== undefined) body.base_updated_at = baseUpdatedAt;
  if (force) body.force = true;
  return requestJSON(`/batches/${encodeURIComponent(batchId)}`, { method: "PUT", body });
}

export function setTrashed(batchId, trashed) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}`, {
    method: "PATCH",
    body: { trashed },
  });
}

export function renameBatch(batchId, name) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}`, {
    method: "PATCH",
    body: { name },
  });
}

export function deleteBatch(batchId) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
}

export function freezeBatch(batchId, payload) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}/freeze`, {
    method: "POST",
    body: payload,
  });
}

export function getBatch(batchId) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}`);
}
