// Import review: one record open in the transcription stage.
//
// The screen's job is to let a person check a transcription against the page they
// are holding, so the store keeps the record exactly as the server sent it and
// every readout goes through the pure helpers. Corrections mark the field `user`;
// the save writes the whole extract back, and the server refuses a changed
// provenance header.

import { reportError } from "../observability.js";
import {
  describeVerification,
  documentTitle,
  editTarget,
  fermentableRows,
  hopRows,
  mashRows,
  missingRequired,
  recordSummary,
  targetRows,
  unmodeledRows,
  warningRows,
  yeastRows,
} from "../views/import/review.js";

export function createImportReviewStore({ client, onClose } = {}) {
  // Getters must be installed, not assigned: Object.assign invokes them once and
  // copies the value, which would freeze every readout against an empty record.
  const store = Object.assign(
    { record: null, busy: false, error: null, savedAt: null, dirty: false },
    reviewActions({ client, onClose })
  );
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(reviewReadouts()));
  return store;
}

function reviewReadouts() {
  return {
    get payload() {
      return this.record?.extract?.payload ?? null;
    },

    get title() {
      return this.record ? documentTitle(this.record) : "";
    },

    get summary() {
      return recordSummary(this.record);
    },

    get targets() {
      return targetRows(this.payload);
    },

    get missing() {
      return missingRequired(this.payload);
    },

    get verification() {
      return describeVerification(this.record?.extract?.verification);
    },

    get fermentables() {
      return fermentableRows(this.payload);
    },

    get hops() {
      return hopRows(this.payload);
    },

    get yeasts() {
      return yeastRows(this.payload);
    },

    get mashes() {
      return mashRows(this.payload);
    },

    get unmodeled() {
      return unmodeledRows(this.payload);
    },

    get warnings() {
      return warningRows(this.payload);
    },

    get counts() {
      const payload = this.payload;
      if (!payload) {
        return { fermentables: 0, hops: 0, yeasts: 0, mashes: 0, unmodeled: 0 };
      }
      return {
        fermentables: payload.fermentables.length,
        hops: payload.hops.length,
        yeasts: payload.yeasts.length,
        mashes: payload.mashes.length,
        unmodeled: payload.unmodeled.length,
      };
    },
  };
}

function reviewActions({ client, onClose }) {
  return {
    open(record) {
      this.record = record ?? null;
      this.error = null;
      this.dirty = false;
      this.savedAt = null;
    },

    close() {
      this.record = null;
      this.error = null;
      this.dirty = false;
      onClose?.();
    },

    setTarget(key, rawValue) {
      if (!this.record) return;
      const payload = editTarget(this.payload, key, rawValue);
      if (payload === this.payload) return;
      this.record = { ...this.record, extract: { ...this.record.extract, payload } };
      this.dirty = true;
      this.error = null;
    },

    async save() {
      if (!this.record || this.busy) return null;
      this.busy = true;
      this.error = null;
      try {
        const updated = await client.patch(this.record.id, { extract: this.record.extract });
        this.record = updated;
        this.dirty = false;
        this.savedAt = "saved";
        return updated;
      } catch (err) {
        this.error = err?.message ?? "Could not save the transcription.";
        reportError("importReview.save", err);
        return null;
      } finally {
        this.busy = false;
      }
    },
  };
}
