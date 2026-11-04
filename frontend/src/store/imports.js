// Imports controller: the queue of documents between "uploaded" and "a batch".
//
// The list is a strip on the landing page and the resume path into the import
// view. Everything durable lives on the server; this store holds what the
// templates bind to, and it keeps the one thing the UI must explain — a
// duplicate — as a first-class state instead of an error string.

import { reportError } from "../observability.js";
import { resumeLabel } from "../views/import/review.js";

const OPEN_STATUSES = new Set(["extracted", "mapping"]);

export function createImportsStore({ client, readFile, onOpen, onError } = {}) {
  return Object.assign(
    {
      rows: [],
      loading: false,
      loadError: false,
      duplicateOf: null, // import id whose document was uploaded again
      starting: false,
      error: null,

      get openRows() {
        return this.rows.filter((row) => OPEN_STATUSES.has(row.status));
      },

      get count() {
        return this.openRows.length;
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

    async start({ filename, file, identity }) {
      const seam = seams();
      if (this.starting) return null;
      this.starting = true;
      this.duplicateOf = null;
      this.error = null;
      try {
        const record = await upload(seam, { filename, file, identity });
        await this.refresh();
        seam.onOpen?.(record);
        return record;
      } catch (err) {
        if (err?.code === "IMPORT_DUPLICATE") {
          this.duplicateOf = err.details?.import_id ?? null;
          this.error = "This document has already been imported.";
          return null;
        }
        this.error = err?.message ?? "Could not read the document.";
        seam.onError?.(err);
        return null;
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

    discardDuplicate() {
      this.duplicateOf = null;
      this.error = null;
    },
  };
}

async function upload(seam, { filename, file, identity }) {
  if (!seam.readFile) throw new Error("imports: no file reader injected");
  const content_base64 = await seam.readFile(file);
  return seam.client.create({ filename, content_base64, identity });
}
