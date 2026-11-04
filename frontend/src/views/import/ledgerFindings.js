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
      message: `Only one strain can set the final gravity and ABV, so the other line will not change any number. Pick the strain that should set them, or add a blend for both.`,
      yeasts: yeasts.map((row) => ({ line_id: row.line_id, name: row.name })),
    });
  }
  return findings;
}
