// One derivation for every surface: what a line is, what a section owes, and
// whether the result on screen still describes the mapping.
//
// Pure. The store supplies the two facts a pure function cannot know — whether a
// pick still resolves, and how to name it — so every screen reads the same answer.

export const ROW = {
  OPEN: "open",
  COMPONENT: "component",
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
export function rowState(row, { resolves = () => true, label = () => "", blendMode = false } = {}) {
  const view = (state, blocks, message) => ({
    state,
    blocks,
    message,
    ref: row?.ref ?? null,
    picked: state === ROW.PICKED || state === ROW.PROPOSED,
    proposed: state === ROW.PROPOSED,
    leftOut: state === ROW.LEFT_OUT,
  });
  if (!row) return { state: null, blocks: false, message: "", ref: null };
  if (row.decision === "ignored") return view(ROW.LEFT_OUT, false, "");
  if (decided(row)) return pickedView(row, view, resolves, label);
  // In a multi-strain recipe the strains are the blend's components, not options:
  // the section owns the decision, so the row must not ask for one or block.
  if (row.section === "yeasts" && blendMode) return view(ROW.COMPONENT, false, componentMessage());
  return view(ROW.OPEN, true, openMessage(row));
}

function decided(row) {
  return row.decision === "mapped" || row.decision === "blended";
}

function pickedView(row, view, resolves, label) {
  if (!row.ref || !resolves(row)) return view(ROW.BROKEN, true, brokenMessage(row, label(row)));
  return view(row.proposed ? ROW.PROPOSED : ROW.PICKED, false, "");
}

function openMessage(row) {
  return row.section === "yeasts"
    ? "Pick this strain's record."
    : "Pick the record the imported recipe printed.";
}

function componentMessage() {
  return "Part of the recipe's blend — choose the blend below.";
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

function yeastIssues({ lines = 0, hasCarrier = false, blendMode = false } = {}) {
  if (lines <= 1 || hasCarrier) return [];
  return [
    {
      section: "yeasts",
      message: blendMode
        ? `Imported recipe names ${lines} strains. Choose the blend that covers them, or one strain to carry the batch.`
        : `Imported recipe names ${lines} strains. A batch ferments with one — choose the strain it takes.`,
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
