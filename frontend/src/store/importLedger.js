// The ledger's actions: the decisions a person makes on each transcribed line.
//
// Candidate chips per line (the model's frozen picks feed the same screen), the
// library search behind a row, and the four ways a line gets decided: a ref, a
// destination, a hop routed to a pool, or an ignore with a reason.

import {
  applyRef,
  destinationLabel,
  destinationsFor,
  ignoreRow,
  restCandidates,
  restoreRow,
  screenCandidates,
  setDestination,
} from "../views/import/ledger.js";
import { catalogKindFor } from "./importMatch.js";

// Looking a line up: the destinations its section offers and the chips the page
// supports. Separate from deciding it, so neither factory becomes a second program.
export function ledgerLookupActions({ catalogs }) {
  return {
    destinationsFor(section) {
      return destinationsFor(section);
    },

    destinationLabel(row) {
      return destinationLabel(row);
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
  };
}

export function ledgerDecisionActions() {
  return {
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
    // the hop that was chosen for that pool and any ignore reason it carried.
    returnHop(lineId) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow({
        ...row,
        destination: null,
        ref: null,
        ref_name: null,
        decision: "unresolved",
        reason: "",
      });
    },

    ignoreLine(lineId, reason = "not modelled") {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow(ignoreRow(row, reason));
    },

    // Ignoring is reversible: the line goes back to the destination the page's own
    // evidence supports, and its ignore reason goes with it.
    restoreLine(lineId) {
      const row = this.ledger.find((candidate) => candidate.line_id === lineId);
      if (!row) return;
      this.replaceRow(restoreRow(row));
    },

    // Saving the map is its forward action: with every line decided there is nothing
    // left to do here, so the same press opens the check. An incomplete map still
    // saves, and stays where the work is.
    async saveAndAdvance() {
      if (this.dirty) {
        const saved = await this.save();
        if (!saved) return null;
      }
      if (!this.unresolved.length) this.stage = "check";
      return true;
    },

    replaceRow(next) {
      const ledger = this.ledger.map((row) => (row.line_id === next.line_id ? next : row));
      this.record = { ...this.record, ledger };
      this.dirty = true;
      this.error = null;
    },
  };
}
