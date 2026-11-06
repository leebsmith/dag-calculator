// Pure legacy-draft row transformations. The adapter owns engine reads and
// writes; these helpers only map plain row arrays so they can be tested without
// an engine instance.

export function filterDoughInRests(rests) {
  if (!Array.isArray(rests)) return { rows: rests, changed: false };
  const rows = rests.filter((rest) => rest?.rest_id !== "dough_in");
  return { rows, changed: rows.length !== rests.length };
}

export function convertWhirlpoolHopRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows, changed: false, knockout: 0 };
  }
  if (rows.every((row) => row?.addition_at_min !== undefined)) {
    return { rows, changed: false, knockout: 0 };
  }
  const durations = rows.map((row) => Number(row?.duration_min) || 0);
  const knockout = Math.max(...durations);
  const converted = rows.map((row, index) => {
    const next = { ...row };
    delete next.duration_min;
    next.addition_at_min = Math.max(0, knockout - durations[index]);
    return next;
  });
  return { rows: converted, changed: true, knockout };
}
