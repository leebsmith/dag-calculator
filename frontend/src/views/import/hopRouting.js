// Hop routing findings and the pool-split estimate: pure, no state.

import { massKg } from "./ledger.js";

// The whirlpool share is the one hop number a page almost never prints, and a
// zero is not a neutral default: it would put the whole IBU budget in the boil
// while whirlpool charges solve a zero mass. So it is a decision, and these are
// the things that make it undecidable.
export function hopFindings({ payload, ledger = [], fraction = null }) {
  const findings = [];
  const whirlpool = ledger.filter(
    (row) => row.destination === "batch.whirlpool_hops" && row.decision === "mapped"
  );
  if (whirlpool.length > 0 && fraction == null) {
    findings.push({
      code: "POOL_SPLIT_REQUIRED",
      blocking: true,
      message:
        "whirlpool hops are mapped but no IBU split is authored, so their pool has no bitterness",
    });
  }
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
