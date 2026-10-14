// Even grid layout for the card picker: arrange N tiles in a factor pair as
// close to a square as possible, landscape (cols >= rows) — 8 -> 4x2, 9 -> 3x3,
// 10 -> 5x2, 12 -> 4x3. When N has no even split that isn't a 1-row strip
// (primes like 7/11/13), fall back to a near-square with a partial last row.
export function evenGrid(n) {
  if (!Number.isInteger(n) || n <= 0) return { cols: 1, rows: 0 };

  let best = { cols: n, rows: 1, diff: n - 1 };
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue;
    const rows = n / cols;
    if (cols < rows) continue; // landscape
    const diff = cols - rows;
    if (diff < best.diff) best = { cols, rows, diff };
  }

  // A single wide row is only acceptable for 1–2 tiles; otherwise go near-square
  // (e.g. 7 -> 3x3 with a short last row).
  if (best.rows === 1 && n >= 3) {
    const cols = Math.ceil(Math.sqrt(n));
    return { cols, rows: Math.ceil(n / cols) };
  }
  return { cols: best.cols, rows: best.rows };
}
