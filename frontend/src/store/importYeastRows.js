// How the imported recipe's yeast lines became the batch's one attenuation: one
// strain, or a blend. A row-level problem stays on the row; this module answers the
// section-level question, and the panel reads it instead of inferring it.

export function yeastReadouts() {
  return {
    // Every strain the imported recipe names: the group a blend is made of, and the
    // pool a single choice comes from.
    get yeastLines() {
      return this.ledger.filter((row) => row.section === "yeasts");
    },

    get mappedYeasts() {
      return this.yeastLines.filter((row) => row.decision === "mapped");
    },

    get blendComponents() {
      return this.yeastLines.filter((row) => row.decision === "blended");
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

  };
}

// The blend's own readouts: its record, its provenance, and what the section still
// needs. Kept apart from the strain readouts so neither factory becomes two.
export function blendReadouts() {
  return {
    // The blend's record, when one is chosen and still exists.
    get yeastBlend() {
      const outcome = this.yeastOutcome;
      if (outcome?.mode !== "blend" || !outcome.ref) return null;
      return this.catalogRecord("yeast", outcome.ref) ? outcome : null;
    },

    // The group's provenance, by name: what the blend is a blend of.
    get blendComponentNames() {
      const outcome = this.yeastOutcome;
      if (outcome?.mode !== "blend") return [];
      const ids = outcome.line_ids ?? [];
      return ids
        .map((id) => this.yeastLines.find((row) => row.line_id === id))
        .filter(Boolean)
        .map((row) => row.ref_name || row.name);
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
      return sectionIssues({
        lines: this.yeastLines.length,
        outcome: this.yeastOutcome,
        blendResolves: Boolean(this.yeastBlend),
        outside: this.yeastLines
          .filter((row) => row.decision !== "blended")
          .map((row) => row.name),
      });
    },
  };
}

// Pure, so the getter stays a read: which sentence the yeasts section still owes.
export function sectionIssues({ lines, outcome, blendResolves, outside }) {
  const decided = outcome?.mode === "blend" || outcome?.mode === "single";
  const undecided = lines > 1 && !decided ? [openIssue(lines)] : [];
  const missing = outcome?.mode === "blend" && !blendResolves ? [deletedIssue(outcome)] : [];
  const strays = outcome?.mode === "blend" && outside.length ? [outsideIssue(outside)] : [];
  return [...undecided, ...missing, ...strays];
}

function openIssue(lines) {
  return {
    section: "yeasts",
    message: `Imported recipe names ${lines} strains. A batch ferments with one attenuation: one strain, or a blend of both.`,
  };
}

function deletedIssue(outcome) {
  return {
    section: "yeasts",
    message: `The blend record (${outcome.name ?? "blend"}) was deleted — pick another, or create one.`,
  };
}

function outsideIssue(outside) {
  return {
    section: "yeasts",
    message: `${outside.join(", ")} is not in this blend. Unblend to decide which strains it covers.`,
  };
}
