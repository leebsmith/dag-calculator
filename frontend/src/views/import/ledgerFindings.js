// Findings that come from the ledger's *shape*, before any solver runs.
//
// One of them is a real limit of the model rather than of the document: a batch has
// exactly one yeast selection, so a page naming a blend (a saison strain plus a
// Brett culture) can map one and must ignore the rest. The finding carries the
// strains, so the decision can be made where it is read, and it says the limit in
// plain words rather than in the model's vocabulary.

export function ledgerFindings({ ledger = [] } = {}) {
  const findings = [];
  const yeasts = ledger.filter(
    (row) => row.section === "yeasts" && row.decision === "mapped"
  );
  if (yeasts.length > 1) {
    findings.push({
      code: "SINGLE_YEAST",
      title: "Two yeasts, one fermentation",
      blocking: true,
      node: "batch.yeast",
      message: `This page names ${yeasts.length} strains, but the calculator ferments with one. Pick the strain that sets how dry the beer gets — the other line stays on the record, marked not used.`,
      yeasts: yeasts.map((row) => ({ line_id: row.line_id, name: row.name })),
    });
  }
  return findings;
}
