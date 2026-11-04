// The imported recipe's yeast outcome, as a decision on the record.
//
// A batch solves one attenuation. The imported recipe may name one strain or
// several, and the way several become one is either "ferment with this one" or a
// blend: one authored Library yeast record whose attenuation the user states. The
// component rows stay mapped — they are the recipe's own fact — and the engine
// still receives a single selection. Records are sealed, so changing a blend's
// attenuation writes a new record and leaves the old one in the Library.

import { reportError } from "../observability.js";
import { blendComponent, unblendComponent } from "../views/import/ledger.js";

const BLEND_PREFIX = "Blend:";

export function blendFormActions({ catalogs = () => [] } = {}) {
  return {
    blendOpen: false,
    blendName: "",
    blendAttenuationPct: "",
    blendBusy: false,
    blendError: null,
    blendNotice: "",

    // The panel: one name and one number. Pre-filled with a name that reads as a
    // blend, because that name is the yeast on the batch and in the report.
    openBlend() {
      const outcome = this.yeastOutcome;
      const replacing = outcome?.mode === "blend" ? outcome : null;
      this.blendOpen = true;
      this.blendName = replacing?.name ?? this.suggestedBlendName();
      this.blendAttenuationPct =
        replacing && this.blendRecordAttenuationPct !== null
          ? String(this.blendRecordAttenuationPct)
          : "";
      this.blendError = null;
      this.blendNotice = replacing
        ? "Saving creates a new Library record; the old blend stays in the Library."
        : "";
    },

    changeBlend() {
      this.openBlend();
    },

    closeBlend() {
      this.blendOpen = false;
      this.blendError = null;
      this.blendNotice = "";
    },

    setBlendName(value) {
      this.blendName = value;
    },

    setBlendAttenuation(value) {
      this.blendAttenuationPct = value;
    },

    suggestedBlendName() {
      const names = this.yeastLines.map((row) => row.name).filter(Boolean);
      return names.length ? `${BLEND_PREFIX} ${names.join(" + ")}` : `${BLEND_PREFIX} `;
    },

    // A Library record already carries this name: saving makes a second one.
    get blendNameTaken() {
      const name = String(this.blendName ?? "").trim();
      if (!name) return false;
      const outcome = this.yeastOutcome;
      if (outcome?.mode === "blend" && outcome.name === name) return false;
      return catalogs("yeast").some((item) => item.name === name);
    },
  };
}

// The recipe's own yeast lines, mapped or not: a blend needs all of them back on
// the recipe before it can be authored, so choosing a strain first must not hide it.
export function blendDecisionActions() {
  return {
    // "Blend both" covers every strain the imported recipe names: the group is the
    // recipe's lines, so no component needs a registry pick first.
    blendAll() {
      this.openBlend();
    },

    // Removing the decision, not the record: the Library owns records, and this one
    // stays there (delete it there if it is not wanted). Persisted at once, so a
    // reload cannot put the blend back.
    async unblend() {
      const outcome = this.yeastOutcome;
      if (outcome?.mode !== "blend") return null;
      // Provenance is what makes this possible: each component goes back to the pick
      // it had (or to open, if it never had one).
      for (const id of outcome.line_ids ?? []) {
        const row = this.ledger.find((line) => line.line_id === id);
        if (row) this.replaceRow(unblendComponent(row));
      }
      this.setYeastOutcome(null);
      this.blendOpen = false;
      this.blendError = null;
      return this.save();
    },
  };
}

// The form speaks percent because brewers do; the record stores the fraction the
// artifact works in. One validation step, so the save path has no branches of its own.
function blendInput({ createYeast, name, attenuation, rows }) {
  if (!createYeast) return { error: "The Library is not available in this build." };
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { error: "Give the blend a name." };
  const pct = Number(attenuation);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { error: "Enter the attenuation the blend finishes at, as a percentage." };
  }
  if (rows.length < 2) {
    return { error: "A blend needs at least two strains in the imported recipe." };
  }
  return { name: trimmed, pct, rows };
}

export function blendSaveActions({ createYeast = null } = {}) {
  return {
    async saveBlend() {
      if (this.blendBusy) return null;
      // The group is the recipe's yeast lines, not the strains that happen to have a
      // registry pick: blending is the alternative to picking each one.
      const rows = this.yeastLines;
      const input = blendInput({
        createYeast,
        name: this.blendName,
        attenuation: this.blendAttenuationPct,
        rows,
      });
      if (input.error) {
        this.blendError = input.error;
        return null;
      }
      this.blendBusy = true;
      try {
        const record = await createYeast({
          name: input.name,
          attenuation_pct: input.pct / 100,
          attenuation_basis: "apparent",
          attenuation_provenance: {
            kind: "authored",
            note: `blend of ${input.rows.map((row) => row.name).join(" + ")}`,
          },
        });
        for (const row of input.rows) {
          this.replaceRow(blendComponent(row));
        }
        this.setYeastOutcome({
          mode: "blend",
          line_ids: input.rows.map((row) => row.line_id),
          ref: record.id,
          name: input.name,
        });
        this.blendOpen = false;
        this.blendError = null;
        this.blendNotice = "";
        // The record exists on the server; the decision that points at it must not
        // wait for a footer press, or closing the record would orphan it.
        await this.save();
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
