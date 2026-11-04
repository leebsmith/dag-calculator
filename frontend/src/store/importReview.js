// Import review: one record open in the transcription, map and check stages.
// Actions are split by concern (ledger, the single yeast, pool split, check, match,
// gap fill) so no factory becomes a second program; readouts go through the pure
// views.

import { reportError } from "../observability.js";
import { checkActions, commitActions } from "./importCheck.js";
import { ledgerDecisionActions, ledgerLookupActions } from "./importLedger.js";
import { matchActions } from "./importMatch.js";
import { gapfillActions } from "./importGapfill.js";
import { waterActions } from "./importWater.js";
import { blendActions } from "./importBlend.js";
import { yeastActions } from "./importYeast.js";
import { hopPanes } from "../views/import/hopRouting.js";
import { poolActions, poolReadouts } from "./importPool.js";
import {
  emptySectionNote,
  noBatchQuantities,
} from "../views/import/emptySections.js";
import {
  buildLedger,
  isResolved,
  ledgerCounts,
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
  catalog = () => null,
  project = null,
  gate = null,
  delta = null,
  commit = null,
  sourceFile = () => null,
  readFile = async () => "",
  profiles = () => [],
  createYeast = null,
  onClose,
} = {}) {
  const check = checkActions({ catalog, project, gate, delta, commit });
  const match = matchActions({ client, catalog });
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
    },
    reviewActions({ client, onClose }),
    saveAction({ client }),
    ledgerLookupActions({ catalogs }),
    ledgerDecisionActions(),
    yeastActions({ catalog }),
    blendActions({ createYeast }),
    check,
    poolActions(),
    match,
    commitActions({ commit }),
    gapfill,
    water,
    reviewReadouts(),
    ledgerReadouts(),
    poolReadouts()
  );
  return store;
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

    // One predicate for the badge, the pane highlight and the notice: they must
    // read the same decision, or the count and the marked rows disagree.
    isUndecided(row) {
      return Boolean(row) && !isResolved(row);
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
