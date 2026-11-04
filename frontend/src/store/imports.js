// Imports controller: the queue of documents between "uploaded" and "a batch".
//
// The list is a strip on the landing page and the resume path into the import
// view. Everything durable lives on the server; this store holds what the
// templates bind to, and it keeps the two states the UI must explain — a
// duplicate and a failure — as first-class values instead of error strings.

import { reportError } from "../observability.js";
import { resumeLabel } from "../views/import/review.js";

const OPEN_STATUSES = new Set(["extracted", "mapping"]);

export function createImportsStore({ client, readFile, onOpen, onError } = {}) {
  return Object.assign(
    {
      rows: [],
      loading: false,
      loadError: false,
      starting: false,
      error: null,
      // The document already on file, and how that record ended.
      duplicateOf: null,
      duplicateStatus: null,
      duplicateReason: null,

      get openRows() {
        return this.rows.filter((row) => OPEN_STATUSES.has(row.status));
      },

      get count() {
        return this.openRows.length;
      },

      get failedRows() {
        return this.rows.filter((row) => row.status === "failed");
      },

      resumeLabel(status) {
        return resumeLabel(status);
      },
    },
    queueActions(() => ({ client, readFile, onOpen, onError }))
  );
}

function queueActions(seams) {
  return {
    async refresh() {
      this.loading = true;
      this.loadError = false;
      try {
        this.rows = await seams().client.list();
      } catch (err) {
        this.loadError = true;
        reportError("imports.refresh", err);
      } finally {
        this.loading = false;
      }
    },

    async start({ filename, file, identity, force = false }) {
      const seam = seams();
      if (this.starting) return null;
      this.starting = true;
      this.clearDuplicate();
      this.error = null;
      try {
        const record = await upload(seam, { filename, file, identity, force });
        await this.refresh();
        seam.onOpen?.(record);
        return record;
      } catch (err) {
        this.error = err?.message ?? "Could not read the document.";
        return handleFailure(this, seam, err);
      } finally {
        this.starting = false;
      }
    },

    async resume(importId) {
      const seam = seams();
      try {
        const record = await seam.client.get(importId);
        seam.onOpen?.(record);
        return record;
      } catch (err) {
        this.error = err?.message ?? "Could not open that import.";
        seam.onError?.(err);
        return null;
      }
    },

    async remove(importId) {
      try {
        await seams().client.remove(importId);
        await this.refresh();
      } catch (err) {
        this.error = err?.message ?? "Could not delete that import.";
        reportError("imports.remove", err);
      }
    },

    clearDuplicate() {
      this.duplicateOf = null;
      this.duplicateStatus = null;
      this.duplicateReason = null;
    },

    discardDuplicate() {
      this.clearDuplicate();
      this.error = null;
    },

    // Read the same document again, after removing the failed record that blocked it.
    async reread({ filename, file, identity }) {
      if (this.duplicateOf) await this.remove(this.duplicateOf);
      this.clearDuplicate();
      return this.start({ filename, file, identity, force: true });
    },
  };
}

function handleFailure(store, seam, err) {
  if (err?.code === "IMPORT_DUPLICATE") {
    store.duplicateOf = err.details?.import_id ?? null;
    store.duplicateStatus = err.details?.status ?? null;
    store.duplicateReason = err.details?.failure_reason ?? null;
    store.error = "This document has already been imported.";
    return null;
  }
  store.error = err?.message ?? "Could not read the document.";
  seam.onError?.(err);
  return null;
}

async function upload(seam, { filename, file, identity, force = false }) {
  if (!seam.readFile) throw new Error("imports: no file reader injected");
  const content_base64 = await seam.readFile(file);
  return seam.client.create({ filename, content_base64, identity, force });
}
