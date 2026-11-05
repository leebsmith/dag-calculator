// Hop routing findings and the pool-split estimate: pure, no state.

import { massKg } from "./ledger.js";

// The whirlpool share is the one hop number a page almost never prints, and a
// zero is not a neutral default: it would put the whole IBU budget in the boil
// while whirlpool charges solve a zero mass. So it is a decision, and these are
// the things that make it undecidable.
export function hopFindings({ payload, ledger = [] }) {
  const findings = [];
  const boilHours = payload?.targets?.boil_time_min?.value;
  const tooLong = ledger.find(
    (row) =>
      row.destination === "batch.boil_hops" && row.decision === "mapped" && row.minutes > boilHours
  );
  if (boilHours > 0 && tooLong) {
    findings.push({
      code: "HOP_LONGER_THAN_BOIL",
      blocking: false,
      message: `${tooLong.name} is boiled ${tooLong.minutes} min but the boil is ${boilHours} min`,
    });
  }
  const flameout = ledger.find(
    (row) => row.destination === "batch.boil_hops" && row.decision === "mapped" && row.minutes === 0
  );
  if (flameout) {
    findings.push({
      code: "FLAMEOUT_IN_BOIL",
      blocking: false,
      message: `${flameout.name} is a zero-minute charge: it belongs in the whirlpool`,
    });
  }
  return findings;
}

// A first estimate when the page gives none: the whirlpool rows' share of alpha
// mass. It overstates whirlpool IBU (a hot charge isomerises more), which is why
// it is labelled an estimate and never applied silently.
export function estimateWhirlpoolFraction(ledger = []) {
  const alpha = (row) => (massKg(row.quantity) ?? 0) * ((row.alpha_acid_pct ?? 0) / 100);
  const mapped = ledger.filter((row) => row.decision === "mapped");
  const boil = mapped
    .filter((row) => row.destination === "batch.boil_hops")
    .reduce((sum, row) => sum + alpha(row), 0);
  const whirlpool = mapped
    .filter((row) => row.destination === "batch.whirlpool_hops")
    .reduce((sum, row) => sum + alpha(row), 0);
  if (!(boil + whirlpool > 0)) return null;
  return whirlpool / (boil + whirlpool);
}


// The routing panes: boil | candidates | whirlpool, with dry hops and the
// not-modelled lines as their own groups. A pane is a destination, not a state, so
// a row can sit in the boil pane still needing a hop chosen — which is what the
// badge in the UI says.
export function hopPanes(ledger = []) {
  const hops = ledger.filter((row) => row.section === "hops");
  const byDestination = (id) => hops.filter((row) => row.destination === id);
  const panes = {
    boil: byDestination("batch.boil_hops"),
    whirlpool: byDestination("batch.whirlpool_hops"),
    candidates: hops.filter((row) => row.destination == null),
    dry: byDestination("batch.dry_hops"),
    ignored: hops.filter((row) => row.decision === "ignored"),
  };
  const order = new Map(hops.map((row, index) => [row.line_id, index + 1]));
  const total = hops.length;
  const tagged = (rows) =>
    rows.map((row) => ({ ...row, tag: `#${order.get(row.line_id) ?? 0} of ${total}` }));
  return Object.fromEntries(
    Object.entries(panes).map(([key, rows]) => [key, tagged(rows)])
  );
}

export const HOP_POOLS = ["batch.boil_hops", "batch.whirlpool_hops"];

export function otherPool(destination) {
  if (destination === "batch.boil_hops") return "batch.whirlpool_hops";
  if (destination === "batch.whirlpool_hops") return "batch.boil_hops";
  return null;
}
