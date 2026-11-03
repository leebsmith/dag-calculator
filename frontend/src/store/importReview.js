// Import review: one record open in the transcription stage.
//
// The screen's job is to let a person check a transcription against the page they
// are holding, so the store keeps the record exactly as the server sent it and
// every readout goes through the pure helpers. Corrections mark the field `user`;
// the save writes the whole extract back, and the server refuses a changed
// provenance header.

import { reportError } from "../observability.js";
import {
  applyRef,
  buildLedger,
  destinationsFor,
  ignoreRow,
  ledgerCounts,
  screenCandidates,
  setDestination,
  shares,
  unresolvedRows,
} from "../views/import/ledger.js";
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

export function createImportReviewStore({ client, catalogs = () => [], onClose } = {}) {
  const store = Object.assign(
    { record: null, stage: "transcribe", busy: false, error: null, savedAt: null, dirty: false },
    reviewActions({ client, onClose }),
    ledgerActions({ catalogs })
  );
  // Getters must be installed, not assigned: Object.assign invokes them once and
  // copies the value, which would freeze every readout against an empty record.
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(reviewReadouts()));
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(ledgerReadouts()));
  return store;
}

const CATALOG_KIND = {
  fermentables: "malt",
  hops: "hop",
  yeasts: "yeast",
  mashes: "mash",
};

export function catalogKindFor(row) {
  if (row.section !== "fermentables") return CATALOG_KIND[row.section] ?? null;
  return row.kind_hint === "sugar" || row.kind_hint === "extract" ? "sugar" : "malt";
}

function ledgerReadouts() {
  return {
    get ledger() {
      return this.record?.ledger ?? [];
    },

    get ledgerCounts() {
      return ledgerCounts(this.ledger);
    },

    get unresolved() {
      return unresolvedRows(this.ledger);
    },

    get sections() {
      const order = ["fermentables", "hops", "yeasts", "mashes", "unmodeled"];
      return order
        .map((section) => ({
          id: section,
          rows: this.ledger.filter((row) => row.section === section),
        }))
        .filter((section) => section.rows.length > 0);
    },

    get shares() {
      return shares(this.ledger);
    },

  };
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

function ledgerActions({ catalogs }) {
  return {
    destinationsFor(section) {
      return destinationsFor(section);
    },

    goTo(stage) {
      if (stage === "map" || stage === "transcribe") this.stage = stage;
    },

    // Candidate chips for one line: the pure screen over the live catalogs.
    suggestions(row, limit = 4) {
      const kind = catalogKindFor(row);
      return kind ? screenCandidates(row.name, catalogs(kind), kind, limit) : [];
    },

    chooseRef(lineId, item) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row || !item) return;
      this.replaceRow(applyRef(row, item, catalogKindFor(row)));
    },

    changeDestination(lineId, destination) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow(setDestination(row, destination));
    },

    ignoreLine(lineId, reason = "not modelled") {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow(ignoreRow(row, reason));
    },

    replaceRow(next) {
      const ledger = this.ledger.map((row) => (row.line_id === next.line_id ? next : row));
      this.record = { ...this.record, ledger };
      this.dirty = true;
      this.error = null;
    },

  };
}

function reviewActions({ client, onClose }) {
  return {
    close() {
      this.record = null;
      this.error = null;
      this.dirty = false;
      onClose?.();
    },

    async discard() {
      if (!this.record) return;
      this.busy = true;
      try {
        await client.remove(this.record.id);
        this.close();
      } catch (err) {
        this.error = err?.message ?? "Could not delete that import.";
        reportError("importReview.discard", err);
      } finally {
        this.busy = false;
      }
    },

    open(record) {
      const withLedger = record
        ? { ...record, ledger: record.ledger?.length ? record.ledger : buildLedger(record.extract?.payload) }
        : null;
      this.record = withLedger;
      this.stage = "transcribe";
      this.error = null;
      this.dirty = false;
      this.savedAt = null;
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
        const updated = await client.patch(this.record.id, {
          extract: this.record.extract,
          ledger: this.record.ledger,
          status: this.record.status === "extracted" && this.record.ledger.length ? "mapping" : undefined,
        });
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
