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
      message: `the model holds one yeast per batch, and ${yeasts.length} strains are mapped — the one you keep carries the batch, the rest are kept as a co-pitch`,
      yeasts: yeasts.map((row) => ({ line_id: row.line_id, name: row.name })),
    });
  }
  return findings;
}
