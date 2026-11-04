// A blend the calculator can actually ferment with: one authored yeast record.
//
// The finding names two mapped strains and the model holds one, so brewing both is
// represented by a single record whose attenuation the user states. The form lives
// on the yeast row it replaces, so a deleted record is recoverable from the line
// that points at it; the Library remains the place that owns records.

import { reportError } from "../observability.js";

export function blendFormActions() {
  return {
    blendOpen: false,
    blendFor: null,
    blendName: "",
    blendAttenuationPct: "",
    blendBusy: false,
    blendError: null,

    // The form belongs to a line: the one being replaced when a record was deleted,
    // or the first mapped yeast when the finding asks for a blend of both.
    openBlend(lineId = null) {
      this.blendOpen = true;
      this.blendFor = lineId ?? this.firstYeastLine();
      this.blendName = "";
      this.blendAttenuationPct = "";
      this.blendError = null;
    },

    // From the check screen: the form lives on the map row, so go there.
    beginBlend(lineId = null) {
      this.goTo("map");
      this.openBlend(lineId);
    },

    closeBlend() {
      this.blendOpen = false;
      this.blendFor = null;
      this.blendError = null;
    },

    setBlendName(value) {
      this.blendName = value;
    },

    setBlendAttenuation(value) {
      this.blendAttenuationPct = value;
    },

    firstYeastLine() {
      const mapped = this.ledger.find(
        (row) => row.section === "yeasts" && row.decision === "mapped"
      );
      const any = mapped ?? this.ledger.find((row) => row.section === "yeasts");
      return any?.line_id ?? null;
    },
  };
}

// The form speaks percent because brewers do; the record stores the fraction the
// artifact works in. One validation step, so the save path has no branches of its own.
function blendInput({ createYeast, name, attenuation, line }) {
  if (!createYeast) return { error: "The Library is not available in this build." };
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { error: "Give the blend a name." };
  const pct = Number(attenuation);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { error: "Enter the attenuation the blend finishes at, as a percentage." };
  }
  if (!line) return { error: "No mapped yeast line to carry the blend." };
  return { name: trimmed, pct, line };
}

export function blendSaveActions({ createYeast = null } = {}) {
  return {
    async saveBlend() {
      if (this.blendBusy) return null;
      const line = this.ledger.find((row) => row.line_id === this.blendFor) ?? null;
      const input = blendInput({
        createYeast,
        name: this.blendName,
        attenuation: this.blendAttenuationPct,
        line,
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
            note: "authored in the import review for a blend",
          },
        });
        this.chooseRef(input.line.line_id, { id: record.id, name: input.name });
        this.keepOnlyYeast(input.line.line_id);
        this.blendOpen = false;
        this.blendFor = null;
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
