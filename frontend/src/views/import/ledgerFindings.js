// Findings that come from the ledger's *shape*, before any solver runs.
//
// One of them is a real limit of the model rather than of the document: a batch has
// exactly one yeast selection, so a page naming a blend (a saison strain plus a
// Brett culture) can map one and must ignore the rest. Saying that plainly is
// better than letting a second row sit unresolved with no explanation — and the
// finding carries the strains so the decision can be made where it is read.

export function ledgerFindings({ ledger = [] } = {}) {
  const findings = [];
  const yeasts = ledger.filter(
    (row) => row.section === "yeasts" && row.decision === "mapped"
  );
  if (yeasts.length > 1) {
    findings.push({
      code: "SINGLE_YEAST",
      blocking: true,
      node: "batch.yeast",
      message: `a batch carries one yeast selection, but ${yeasts.length} strains are mapped — keep one and ignore the others`,
      yeasts: yeasts.map((row) => ({ line_id: row.line_id, name: row.name })),
    });
  }
  return findings;
}
