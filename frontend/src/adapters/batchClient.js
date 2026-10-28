// Batch (draft/frozen) persistence client over the JSON seam. Browser-only —
// not imported by node tests.

import { requestBlob, requestJSON } from "./apiClient.js";

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

export function getReportBundle(batchId) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}/report-bundle`);
}

export function previewReportBundle(batchId, payload) {
  return requestJSON(`/batches/${encodeURIComponent(batchId)}/report-bundle`, {
    method: "POST",
    body: payload,
  });
}

const REPORT_PARAMS = ["doc_kind", "sections", "paper", "format", "page"];

function reportPath(batchId, params = {}) {
  const search = new URLSearchParams();
  for (const key of REPORT_PARAMS) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return `/batches/${encodeURIComponent(batchId)}/report${query ? `?${query}` : ""}`;
}

export function getReport(batchId, params) {
  return requestBlob(reportPath(batchId, params));
}

export function postReport(batchId, bundle, params) {
  return requestBlob(reportPath(batchId, params), {
    method: "POST",
    body: { bundle },
  });
}
