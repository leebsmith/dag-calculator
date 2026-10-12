// Batch (draft/frozen) persistence client over the JSON seam. Browser-only —
// not imported by node tests.

import { requestJSON } from "./apiClient.js";

export function listBatches() {
  return requestJSON("/batches");
}

export function createBatch(payload) {
  return requestJSON("/batches", { method: "POST", body: payload });
}

export function updateDraft(batchId, payload) {
  return requestJSON(`/batches/${batchId}/draft`, { method: "PUT", body: payload });
}

export function getBatch(batchId) {
  return requestJSON(`/batches/${batchId}`);
}
