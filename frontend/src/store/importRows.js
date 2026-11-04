// Per-row readouts: what a line points at, what it still needs, and whether it is
// decided. A row-level problem lives on the row; the header only counts them.

import { isResolved } from "../views/import/ledger.js";

// Only a row that stands on its own pick can lose it. A blend component keeps a
// name and a page; the batch carries the blend, not the component.
const RESOLVED_WITH_REF = new Set(["mapped"]);
import { catalogKindFor } from "./importMatch.js";

export function rowReadouts({ hasCatalog }) {
  return {
    // What the row points at, by name. The row keeps the name it was picked by, so a
    // record deleted afterwards still reads as a name and never as an id.
    refLabel(row) {
      if (!row?.ref) return "";
      if (row.ref_name) return row.ref_name;
      const kind = catalogKindFor(row);
      const item = kind ? this.catalogRecord(kind, row.ref) : null;
      // A record that is gone leaves the page's own words as the best name we have.
      return item?.name ?? row.name ?? "deleted record";
    },

    // A mapped line whose registry record has since been deleted is not decided:
    // the ref still reads on the row, but the projection would resolve nothing.
    isDangling(row) {
      if (!hasCatalog || !row?.ref || row.section === "mashes" || !RESOLVED_WITH_REF.has(row.decision)) {
        return false;
      }
      const kind = catalogKindFor(row);
      return kind ? this.catalogRecord(kind, row.ref) == null : false;
    },

    get missingRefs() {
      return this.ledger.filter((row) => this.isDangling(row));
    },

    // One sentence for what the line still needs, or "" when it needs nothing.
    rowIssue(row) {
      if (!row || row.decision === "ignored") return "";
      if (this.isDangling(row)) {
        return `The record you picked (${this.refLabel(row)}) was deleted — pick another, or create one.`;
      }
      if (!row.ref) {
        return row.section === "yeasts" && this.yeastLines.length > 1
          ? "Pick this strain's record, or blend the strains below."
          : "Pick the record the imported recipe printed.";
      }
      return "";
    },

    // One predicate for the badge, the pane highlight and the notice: they must read
    // the same decision, or the count and the marked rows disagree.
    isUndecided(row) {
      if (!row) return false;
      return !isResolved(row) || this.isDangling(row);
    },

  };
}
