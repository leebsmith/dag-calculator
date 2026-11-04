// How the imported recipe's yeast lines became the batch's one attenuation: one
// strain, or a blend. A row-level problem stays on the row; this module answers the
// section-level question, and the panel reads it instead of inferring it.

export function yeastReadouts() {
  return {
    // The strain that ferments the batch, and every strain the page named. The
    // yeasts section is a slot with one occupant; the rest are documentation.
    get mappedYeasts() {
      return this.ledger.filter(
        (row) => row.section === "yeasts" && row.decision === "mapped"
      );
    },

    get fermentingYeastId() {
      const outcome = this.yeastOutcome;
      if (outcome?.mode === "blend") return null;
      return outcome?.line_id ?? null;
    },

    // How the imported recipe's yeast lines became the batch's one attenuation.
    // Stored on the record; reconciled against the rows so it cannot drift.
    get yeastOutcome() {
      const mapped = this.mappedYeasts.map((row) => row.line_id);
      const stated = this.record?.yeast_outcome ?? null;
      if (stated?.mode === "blend") return stated;
      if (stated?.mode === "single" && mapped.includes(stated.line_id)) return stated;
      return mapped.length === 1 ? { mode: "single", line_id: mapped[0] } : null;
    },

    // The blend's record, when one is chosen and still exists.
    get yeastBlend() {
      const outcome = this.yeastOutcome;
      if (outcome?.mode !== "blend" || !outcome.ref) return null;
      return this.catalogRecord("yeast", outcome.ref) ? outcome : null;
    },

    get blendRecordAttenuationPct() {
      const blend = this.yeastBlend;
      const record = blend ? this.catalogRecord("yeast", blend.ref) : null;
      const value = record?.attenuation_pct;
      return typeof value === "number" ? Math.round(value * 1000) / 10 : null;
    },

    // A decision about a group of rows rather than about one row: the yeasts have
    // two strains on the recipe and no single attenuation yet.
    get sectionIssues() {
      const issues = [];
      const outcome = this.yeastOutcome;
      if (this.mappedYeasts.length > 1 && outcome?.mode !== "blend") {
        issues.push({
          section: "yeasts",
          message: `Imported recipe names ${this.mappedYeasts.length} strains. A batch ferments with one attenuation: one strain, or a blend of both.`,
        });
      }
      if (outcome?.mode === "blend" && !this.yeastBlend) {
        issues.push({
          section: "yeasts",
          message: `The blend record (${outcome.name ?? "blend"}) was deleted — pick another, or create one.`,
        });
      }
      return issues;
    },
  };
}
