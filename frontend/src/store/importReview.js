// Import review: one record open in the transcription, map and check stages.
// Actions are split by concern (ledger, the single yeast, pool split, check, match,
// gap fill) so no factory becomes a second program; readouts go through the pure
// views.

import { reportError } from "../observability.js";
import { checkActions, commitActions } from "./importCheck.js";
import { ledgerDecisionActions, ledgerLookupActions } from "./importLedger.js";
import { matchActions } from "./importMatch.js";
import { rowReadouts } from "./importRows.js";
import { yeastReadouts } from "./importYeastRows.js";
import { stateReadouts } from "./importState.js";
import { gapfillActions } from "./importGapfill.js";
import { waterActions } from "./importWater.js";
import { yeastActions } from "./importYeast.js";
import { hopPanes } from "../views/import/hopRouting.js";
import { poolActions, poolReadouts } from "./importPool.js";
import {
  emptySectionNote,
  noBatchQuantities,
} from "../views/import/emptySections.js";
import {
  buildLedger,
  ledgerCounts,
  shares,
  withoutBlendComponents,
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
  verdictFor,
  warningRows,
  yeastRows,
} from "../views/import/review.js";

const SECTION_ORDER = ["fermentables", "hops", "yeasts", "mashes", "unmodeled"];

// Composition that installs accessors instead of invoking them: `Object.assign`
// calls a getter once and copies the value, which both freezes the readout and
// runs its body at boot (before the stores it reads exist).
function compose(...sources) {
  const target = {};
  for (const source of sources) {
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
  }
  return target;
}

export function createImportReviewStore({
  client,
  catalogs = () => [],
  catalog = null,
  project = null,
  gate = null,
  delta = null,
  commit = null,
  sourceFile = () => null,
  readFile = async () => "",
  profiles = () => [],
  onClose,
} = {}) {
  // A catalog is what makes a ref checkable. Without one (a bare store in a test)
  // a mapped row is taken at its word rather than reported as dangling.
  const lookup = catalogOrNull(catalog);
  const check = checkActions({ catalog: lookup, project, gate, delta, commit });
  const match = matchActions({ client, catalog: lookup });
  const gapfill = gapfillActions({ client, sourceFile, readFile });
  const water = waterActions({ profiles });
  const store = compose(
    {
      record: null,
      stage: "transcribe",
      queries: {},
      busy: false,
      checkBusy: false,
      commitBusy: false,
      gapfillBusy: false,
      gapfillResult: null,
      matchBusy: false,
      matchError: null,
      checkError: null,
      gate: null,
      delta: null,
      error: null,
      savedAt: null,
      dirty: false,
      revision: 0,
    },
    reviewActions({ onClose }),
    recordActions({ client }),
    saveAction({ client }),
    ledgerLookupActions({ catalogs, catalog: lookup }),
    ledgerDecisionActions(),
    yeastActions(),
    check,
    poolActions(),
    match,
    commitActions({ commit }),
    gapfill,
    water,
    reviewReadouts(),
    ledgerReadouts(),
    rowReadouts({ hasCatalog: Boolean(catalog) }),
    yeastReadouts(),
    stateReadouts(),
    poolReadouts()
  );
  return store;
}

function recordActions({ client }) {
  return {
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

function catalogOrNull(catalog) {
  return catalog || (() => null);
}

function ledgerReadouts() {
  return {
    get ledger() {
      return this.record?.ledger ?? [];
    },

    get ledgerCounts() {
      return ledgerCounts(this.ledger);
    },

    // Everything the gate will refuse over: an undecided line, or a line whose
    // picked record was deleted after the fact.
    // One derivation, not two: a row is unresolved when its state says it blocks.
    get unresolved() {
      return this.ledger.filter((row) => this.rowState(row).blocks);
    },

    get sections() {
      return SECTION_ORDER.map((section) => {
        const rows = this.ledger.filter((row) => row.section === section);
        return { id: section, rows, empty: rows.length === 0, note: this.emptyNote(section) };
      });
    },

    emptyNote(section) {
      return emptySectionNote(this.payload, section, this.noBatchQuantities);
    },

    get noBatchQuantities() {
      return noBatchQuantities(this.payload);
    },

    get verdict() {
      return verdictFor(this.payload);
    },

    // The stages are a sequence, not three views: saying which step this is makes
    // "check" read as the last one rather than as a verb that might repeat.
    get stageLabel() {
      return (
        {
          transcribe: "Step 1 of 3 · Transcribe",
          map: "Step 2 of 3 · Map",
          check: "Step 3 of 3 · Check and create",
        }[this.stage] ?? ""
      );
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
          // Named even when null: clearing the split has to reach the record.
          pool_ibu_fraction: this.record.pool_ibu_fraction ?? null,
          pool_ibu_source: this.record.pool_ibu_source ?? null,
          // Named even when null: clearing the carrier decision has to reach the record.
          yeast_outcome: this.record.yeast_outcome ?? null,
          delta: this.record.delta ?? null,
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

function reviewActions({ onClose }) {
  return {
    open(record) {
      const withLedger = record
        ? {
            ...record,
            // A record written while blends lived in the mapping phase is read as the
            // picks it already carried; the carrier decision is what survives.
            yeast_outcome: record.yeast_outcome?.mode === "blend" ? null : record.yeast_outcome,
            ledger: withoutBlendComponents(
              record.ledger?.length ? record.ledger : buildLedger(record.extract?.payload)
            ),
          }
        : null;
      this.record = withLedger;
      // A record whose mapping is under way reopens where it was left, not at the
      // transcription it already passed.
      this.stage = record?.status === "mapping" ? "map" : "transcribe";
      this.error = null;
      this.checkError = null;
      this.gate = null;
      this.delta = null;
      Object.assign(this, { dirty: false, savedAt: null, revision: 0 });
    },

    // Clearing the open record is not the same as leaving the view: a commit hands
    // navigation to its own command (which opens the new batch), while closing the
    // import returns to the seam.
    reset() {
      this.record = null;
      this.error = null;
      this.dirty = false;
    },

    close() {
      this.reset();
      onClose?.();
    },

    setTarget(key, rawValue) {
      if (!this.record) return;
      const payload = editTarget(this.payload, key, rawValue);
      if (payload === this.payload) return;
      this.record = { ...this.record, extract: { ...this.record.extract, payload } };
      this.dirty = true;
      this.error = null;
      this.revision += 1;
    },

  };
}
