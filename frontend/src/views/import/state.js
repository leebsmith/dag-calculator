// One derivation for every surface: what a line is, what a section owes, and
// whether the result on screen still describes the mapping.
//
// Pure. The store supplies the two facts a pure function cannot know — whether a
// pick still resolves, and how to name it — so every screen reads the same answer.

export const ROW = {
  OPEN: "open",
  PICKED: "picked",
  LEFT_OUT: "left-out",
  PROPOSED: "proposed",
  BROKEN: "broken",
};

export const GATE = {
  UNCHECKED: "unchecked",
  CHECKING: "checking",
  FRESH_OK: "fresh-ok",
  FRESH_BLOCKED: "fresh-blocked",
  STALE: "stale",
};

// `resolves(row)` answers "does the registry still have this pick?"; `label(row)`
// is the name to show when it does not.
export function rowState(row, { resolves = () => true, label = () => "" } = {}) {
  if (!row) return { state: null, blocks: false, message: "" };
  if (row.decision === "ignored") {
    return { state: ROW.LEFT_OUT, blocks: false, message: "" };
  }
  if (row.decision !== "mapped" && row.decision !== "blended") {
    return { state: ROW.OPEN, blocks: true, message: openMessage(row) };
  }
  if (!row.ref || !resolves(row)) {
    return { state: ROW.BROKEN, blocks: true, message: brokenMessage(row, label(row)) };
  }
  return { state: row.proposed ? ROW.PROPOSED : ROW.PICKED, blocks: false, message: "" };
}

function openMessage(row) {
  return row.section === "yeasts"
    ? "Pick this strain's record."
    : "Pick the record the imported recipe printed.";
}

function brokenMessage(row, name) {
  return `The record you picked (${name || row.name}) was deleted — pick another, or create one.`;
}

// Sections own decisions about a group of rows: the carrier, the whirlpool split.
export function sectionState(sectionId, facts = {}) {
  const issues = sectionIssues(sectionId, facts);
  return { state: issues.length ? "open" : "decided", issues };
}

export function sectionIssues(sectionId, facts = {}) {
  if (sectionId === "yeasts") return yeastIssues(facts);
  if (sectionId === "hops") return hopIssues(facts);
  return [];
}

function yeastIssues({ yeastPicked = 0, hasCarrier = false } = {}) {
  if (yeastPicked <= 1 || hasCarrier) return [];
  return [
    {
      section: "yeasts",
      message: `Imported recipe names ${yeastPicked} strains. A batch ferments with one — choose the strain it takes.`,
    },
  ];
}

function hopIssues({ whirlpoolPicked = false, hasSplit = false } = {}) {
  if (!whirlpoolPicked || hasSplit) return [];
  return [
    {
      section: "hops",
      message:
        "Whirlpool hops are mapped but no IBU split is authored — set the share in the whirlpool panel above.",
    },
  ];
}

// The gate keeps the revision it solved, so a later decision reads as stale rather
// than erasing the evidence of what changed.
export function gateState({ gate = null, revision = 0, checking = false, open = false } = {}) {
  if (checking) return GATE.CHECKING;
  if (!gate) return GATE.UNCHECKED;
  if (gate.revision !== revision) return GATE.STALE;
  return blocked(gate, open) ? GATE.FRESH_BLOCKED : GATE.FRESH_OK;
}

function blocked(gate, open) {
  return open || (gate.blocking?.length ?? 0) > 0;
}
