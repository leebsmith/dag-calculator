// Import review: one record open in the transcription, map and check stages.
//
// The screen's job is to let a person check a transcription against the page they
// are holding, then decide what it means for this calculator. Every readout goes
// through the pure helpers; the actions are split by concern (ledger, pool split,
// check) so no single factory becomes a second program.

import { reportError } from "../observability.js";
import { checkActions } from "./importCheck.js";
import { hopPanes } from "../views/import/hopRouting.js";
import { poolActions, poolReadouts } from "./importPool.js";
import {
  applyRef,
  buildLedger,
  destinationsFor,
  ignoreRow,
  ledgerCounts,
  restCandidates,
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

const SECTION_ORDER = ["fermentables", "hops", "yeasts", "mashes", "unmodeled"];
const CATALOG_KIND = { fermentables: "malt", hops: "hop", yeasts: "yeast", mashes: "mash" };

export function createImportReviewStore({
  client,
  catalogs = () => [],
  catalog = () => null,
  project = null,
  gate = null,
  delta = null,
  onClose,
} = {}) {
  const store = Object.assign(
    {
      record: null,
      stage: "transcribe",
      queries: {},
      busy: false,
      checkBusy: false,
      checkError: null,
      gate: null,
      delta: null,
      error: null,
      savedAt: null,
      dirty: false,
    },
    reviewActions({ client, onClose }),
    saveAction({ client }),
    ledgerActions({ catalogs }),
    checkActions({ catalog, project, gate, delta }),
    poolActions()
  );
  // Getters, not values: Object.assign would collapse them at creation.
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(reviewReadouts()));
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(ledgerReadouts()));
  Object.defineProperties(store, Object.getOwnPropertyDescriptors(poolReadouts()));
  return store;
}

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
      return SECTION_ORDER.map((section) => {
        const rows = this.ledger.filter((row) => row.section === section);
        return { id: section, rows, empty: rows.length === 0, note: this.emptyNote(section) };
      });
    },

    // Why a section is empty, in the page's own terms. Silence reads as a bug.
    emptyNote(section) {
      const payload = this.payload;
      if (!payload) return "";
      if (section === "unmodeled") return "nothing outside the model was captured";
      if (this.noBatchQuantities && (section === "fermentables" || section === "hops")) {
        return payload.document_type === "spec_sheet"
          ? "none on this page: the quantities are stated per unit of production volume and sit below"
          : "none on this page";
      }
      return "none on this page";
    },

    get noBatchQuantities() {
      const payload = this.payload;
      if (!payload) return false;
      return payload.fermentables.length === 0 && payload.hops.length === 0;
    },

    // The verdict narrates the evidence; it never decides on its own.
    get verdict() {
      if (!this.noBatchQuantities) return null;
      const spec = this.payload?.document_type === "spec_sheet";
      return {
        title: spec
          ? "Read as a production specification: no batch quantities"
          : "No batch quantities on this page",
        detail: spec
          ? "The ingredient quantities are stated per unit of production volume, so there is no batch to build. Keep the reading as a failed marker so the same document is never paid for twice, or delete it."
          : "The page names ingredients but states no amounts for a batch. Keep the reading as a failed marker, or delete it.",
        reason: spec
          ? "spec sheet: quantities stated per unit of production volume"
          : "no batch quantities on this page",
      };
    },

    get shares() {
      return shares(this.ledger);
    },

    get hopPanes() {
      return hopPanes(this.ledger);
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
      if (["transcribe", "map", "check"].includes(stage)) this.stage = stage;
    },

    // Candidate chips for one line. Mash steps pick from the model's eight rests
    // by temperature; everything else screens the live catalogs by name.
    suggestions(row, limit = 4) {
      if (row.section === "mashes") {
        return restCandidates(row.temperature, limit).map((rest) => ({
          id: rest.rest_id,
          name: rest.name,
          detail: rest.detail,
        }));
      }
      const kind = catalogKindFor(row);
      return kind ? screenCandidates(row.name, catalogs(kind), kind, limit) : [];
    },

    setQuery(lineId, value) {
      this.queries = { ...this.queries, [lineId]: value };
    },

    queryFor(lineId) {
      return this.queries[lineId] ?? "";
    },

    search(row) {
      const query = this.queryFor(row.line_id).trim();
      if (!query) return [];
      const kind = catalogKindFor(row);
      return kind ? screenCandidates(query, catalogs(kind), kind, 8) : [];
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

    moveHop(lineId, destination) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow(setDestination(row, destination));
    },

    // Back to the candidates pane: the routing decision is withdrawn, and with it
    // the hop that was chosen for that pool.
    returnHop(lineId) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow({ ...row, destination: null, ref: null, decision: "unresolved" });
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

function saveAction({ client }) {
  return {
    async save() {
      if (!this.record || this.busy) return null;
      this.busy = true;
      this.error = null;
      try {
        const updated = await client.patch(this.record.id, {
          extract: this.record.extract,
          ledger: this.record.ledger,
          pool_ibu_fraction: this.record.pool_ibu_fraction ?? undefined,
          pool_ibu_source: this.record.pool_ibu_source ?? undefined,
          status:
            this.record.status === "extracted" && this.record.ledger.length ? "mapping" : undefined,
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

function reviewActions({ client, onClose }) {
  return {
    open(record) {
      const withLedger = record
        ? {
            ...record,
            ledger: record.ledger?.length ? record.ledger : buildLedger(record.extract?.payload),
          }
        : null;
      this.record = withLedger;
      this.stage = "transcribe";
      this.error = null;
      this.checkError = null;
      this.gate = null;
      this.delta = null;
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

    async markFailed() {
      if (!this.record || this.busy) return null;
      const verdict = this.verdict;
      this.busy = true;
      this.error = null;
      try {
        await client.patch(this.record.id, {
          status: "failed",
          failure_reason: verdict?.reason ?? "no batch quantities on this page",
        });
        this.close();
        return true;
      } catch (err) {
        this.error = err?.message ?? "Could not mark the import as failed.";
        reportError("importReview.markFailed", err);
        return null;
      } finally {
        this.busy = false;
      }
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

  };
}
