// A blend the calculator can actually ferment with: one authored yeast record.
//
// The finding names two mapped strains and the model holds one, so brewing both is
// represented by a single record whose attenuation the user states. Creating it
// here — where the decision is read — keeps the promise on the screen true; the
// Library remains the place that owns records, not a detour the user has to find.

import { reportError } from "../observability.js";

export function blendActions({ createYeast = null } = {}) {
  return {
    blendOpen: false,
    blendName: "",
    blendAttenuationPct: "",
    blendBusy: false,
    blendError: null,

    openBlend() {
      this.blendOpen = true;
      this.blendName = "";
      this.blendAttenuationPct = "";
      this.blendError = null;
    },

    closeBlend() {
      this.blendOpen = false;
      this.blendError = null;
    },

    setBlendName(value) {
      this.blendName = value;
    },

    setBlendAttenuation(value) {
      this.blendAttenuationPct = value;
    },

    // The form speaks percent because brewers do; the record stores the fraction the
    // artifact works in. On success the blend becomes the batch's strain in one step:
    // the first mapped line carries it, and the others are marked not used.
    async saveBlend() {
      if (this.blendBusy) return null;
      if (!createYeast) {
        this.blendError = "The Library is not available in this build.";
        return null;
      }
      const name = String(this.blendName ?? "").trim();
      const pct = Number(this.blendAttenuationPct);
      if (!name) {
        this.blendError = "Give the blend a name.";
        return null;
      }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        this.blendError = "Enter the attenuation the blend finishes at, as a percentage.";
        return null;
      }
      const line = this.ledger.find((row) => row.section === "yeasts" && row.decision === "mapped");
      if (!line) {
        this.blendError = "No mapped yeast line to carry the blend.";
        return null;
      }
      this.blendBusy = true;
      try {
        const record = await createYeast({
          name,
          attenuation_pct: pct / 100,
          attenuation_basis: "apparent",
          attenuation_provenance: {
            kind: "authored",
            note: "authored in the import review for a blend",
          },
        });
        this.chooseRef(line.line_id, { id: record.id, name });
        this.keepOnlyYeast(line.line_id);
        this.blendOpen = false;
        this.blendError = null;
        return record;
      } catch (err) {
        this.blendError = err?.message ?? "The blend could not be saved.";
        reportError("importReview.saveBlend", err);
        return null;
      } finally {
        this.blendBusy = false;
      }
    },
  };
}
