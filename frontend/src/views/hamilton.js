// Host-side Hamilton (largest-remainder) allocation: distribute grist `parts`
// into fractions that sum to exactly 100% at 0.1% (0.001) resolution.
//
// This is a formulation rule (TODO/L3) — the grist `parts -> pct` normalization
// lives on the host, not in the artifact, so the grain bill is authorable while
// `w_i` stays real. Ties break by larger `parts`, then by original index, so the
// result is deterministic.
const RESOLUTION = 1000; // integer units of 0.1% per whole

export function hamiltonPct(parts) {
  const weights = parts.map((p) => (typeof p === "number" && p > 0 ? p : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / total) * RESOLUTION);
  const units = exact.map(Math.floor);
  const remaining = RESOLUTION - units.reduce((sum, u) => sum + u, 0);

  const order = weights
    .map((weight, i) => ({ i, remainder: exact[i] - units[i], weight }))
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.i - b.i);

  for (let k = 0; k < remaining; k++) units[order[k].i] += 1;
  return units.map((u) => u / RESOLUTION);
}
