// Gap fill: re-read the document for the required scalars the first pass missed.
//
// The document is not stored, so this re-sends it — that is the price of keeping no
// PDFs, and the reason the action is explicit rather than automatic. The reply may
// only fill what is absent; the merge enforces that.

import { reportError } from "../observability.js";
import { applyFilledTargets, missingTargetNames } from "../views/import/review.js";

export function gapfillActions({ client, readFile, sourceFile }) {
  const seams = () => ({ client, readFile, sourceFile });
  return {
    get missingNames() {
      return missingTargetNames(this.payload);
    },

    async askForMissing() {
      const blocked = this.gapfillBlocker();
      if (blocked) {
        this.error = blocked;
        return null;
      }
      const missing = this.missingNames;
      this.gapfillBusy = true;
      this.error = null;
      try {
        return await this.readAgain(missing, seams());
      } catch (err) {
        this.error = err?.message ?? "The page could not be read again.";
        reportError("importReview.askForMissing", err);
        return null;
      } finally {
        this.gapfillBusy = false;
      }
    },

    gapfillBlocker() {
      if (!this.record) return "No import is open.";
      if (this.gapfillBusy) return null;
      if (!this.missingNames.length) return null;
      if (!seams().sourceFile?.()) {
        return "The document is no longer in memory — upload it again to re-read it.";
      }
      return null;
    },

    async readAgain(missing, seam) {
      const content_base64 = await seam.readFile(seam.sourceFile());
      const filled = await seam.client.gapfill({
        content_base64,
        filename: this.summary?.filename ?? "document.pdf",
        request: {
          missing,
          title: this.payload?.title ?? null,
          style_name: this.payload?.style_name ?? null,
        },
      });
      const payload = applyFilledTargets(this.payload, filled);
      if (payload !== this.payload) {
        this.record = { ...this.record, extract: { ...this.record.extract, payload } };
        this.dirty = true;
      }
      this.gapfillResult = missing.filter((name) => payload.targets?.[name]).length;
      return payload;
    },
  };
}
