// Batch (draft/frozen) persistence client over the JSON seam. Browser-only —
// the app hands it the shared JSON seam at construction.

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

export function createBatchClient({ api }) {
  return {
    listBatches() {
      return api.requestJSON("/batches");
    },

    upsertBatch(batchId, payload, baseUpdatedAt, force = false) {
      const body = { ...payload };
      if (baseUpdatedAt !== undefined) body.base_updated_at = baseUpdatedAt;
      if (force) body.force = true;
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}`, {
        method: "PUT",
        body,
      });
    },

    setTrashed(batchId, trashed) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}`, {
        method: "PATCH",
        body: { trashed },
      });
    },

    renameBatch(batchId, name) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}`, {
        method: "PATCH",
        body: { name },
      });
    },

    deleteBatch(batchId) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
    },

    freezeBatch(batchId, payload) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}/freeze`, {
        method: "POST",
        body: payload,
      });
    },

    getBatch(batchId) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}`);
    },

    getReportBundle(batchId) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}/report-bundle`);
    },

    previewReportBundle(batchId, payload) {
      return api.requestJSON(`/batches/${encodeURIComponent(batchId)}/report-bundle`, {
        method: "POST",
        body: payload,
      });
    },

    getReportSections() {
      return api.requestJSON("/report/sections");
    },

    getReport(batchId, params) {
      return api.requestBlob(reportPath(batchId, params));
    },

    postReport(batchId, bundle, params) {
      return api.requestBlob(reportPath(batchId, params), {
        method: "POST",
        body: { bundle },
      });
    },
  };
}
