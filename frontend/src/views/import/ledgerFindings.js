// Findings that come from the ledger's *shape*, before any solver runs.
//
// Two of them are real limits rather than document problems: a batch has exactly
// one yeast selection, so a page naming a blend can map one and must mark the rest
// not used; and a line can point at a record that was deleted after it was picked.
// Both say what they mean in plain words, and both carry the rows they are about so
// the decision can be made where the finding is read.

export function ledgerFindings({ ledger = [], missing = [] } = {}) {
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

  if (missing.length) {
    const names = missing.map((row) => row.name || row.text).join(", ");
    findings.push({
      code: "REF_NOT_FOUND",
      title: missing.length === 1 ? "A picked record was deleted" : "Picked records were deleted",
      blocking: true,
      node: "ledger",
      message: `${names} still point${missing.length === 1 ? "s" : ""} at a record that no longer exists, so this beer cannot be solved until ${missing.length === 1 ? "it is" : "they are"} picked again.`,
      lines: missing.map((row) => ({ line_id: row.line_id, name: row.name || row.text })),
    });
  }

  return findings;
}
