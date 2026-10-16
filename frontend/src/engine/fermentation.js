// Fermentation geometry: the BJCP style's feasible OE/AE region and its
// centroid, from which the batch's apparent attenuation (AA) and target ABV are
// derived. Pure and engine-independent; mirrors backend/app/core/utils.py
// (ASBC cubic + Cutaia 2009, ethanol density 0.7907).

const ETHANOL_DENSITY = 0.7907;
const CUTAIA_A = 0.372;
const CUTAIA_B = 0.00357;

// ASBC Table 1 cubic (SG -> degrees Plato).
export function sgToPlato(sg) {
  return ((135.997 * sg - 630.272) * sg + 1111.14) * sg - 616.868;
}

// ASBC 3rd-order polynomial (degrees Plato -> SG). Not the exact cubic inverse;
// matches backend/app/core/utils.py::plato_to_sg.
export function platoToSg(plato) {
  return 1.0000131 + 0.00386777 * plato + 1.27447e-5 * plato * plato + 6.34964e-8 * plato * plato * plato;
}

// Cutaia-Reid-Speers (2009) ABV (% v/v) from original/apparent extract (Plato).
export function cutaiaAbv(oe, ae) {
  const abw = (CUTAIA_A + CUTAIA_B * oe) * (oe - ae);
  return abw * (platoToSg(ae) / ETHANOL_DENSITY);
}

// ABV along a fixed-AE (horizontal) edge is quadratic in OE; solve for OE.
function horizontalCrossings(ae, targetAbv) {
  const k = platoToSg(ae) / ETHANOL_DENSITY;
  const a = CUTAIA_B;
  const b = CUTAIA_A - CUTAIA_B * ae;
  const c = -CUTAIA_A * ae - targetAbv / k;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const roots = [];
  if (disc === 0) {
    roots.push(-b / (2 * a));
  } else {
    const sqrt = Math.sqrt(disc);
    roots.push((-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a));
  }
  return roots;
}

// ABV along a fixed-OE (vertical) edge is monotone decreasing in AE; bisect.
function verticalCrossing(oe, aeMin, aeMax, targetAbv) {
  const f = (ae) => cutaiaAbv(oe, ae) - targetAbv;
  let lo = aeMin;
  let hi = aeMax;
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (fLo * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function dedupe(points) {
  const out = [];
  for (const [x, y] of points) {
    if (!out.some(([px, py]) => Math.abs(px - x) < 1e-9 && Math.abs(py - y) < 1e-9)) {
      out.push([x, y]);
    }
  }
  return out;
}

// Polygon vertices of the feasible region, ordered counter-clockwise.
export function feasibleVertices({ ogMin, ogMax, fgMin, fgMax, abvMin, abvMax }) {
  const oeMin = sgToPlato(ogMin);
  const oeMax = sgToPlato(ogMax);
  const aeMin = sgToPlato(fgMin);
  const aeMax = sgToPlato(fgMax);

  const inBounds = (oe, ae) => {
    const abv = cutaiaAbv(oe, ae);
    return abv >= abvMin && abv <= abvMax;
  };

  const points = [];
  for (const [oe, ae] of [[oeMin, aeMin], [oeMax, aeMin], [oeMax, aeMax], [oeMin, aeMax]]) {
    if (inBounds(oe, ae)) points.push([oe, ae]);
  }
  for (const target of [abvMin, abvMax]) {
    for (const ae of [aeMin, aeMax]) {
      for (const oe of horizontalCrossings(ae, target)) {
        if (oe >= oeMin && oe <= oeMax) points.push([oe, ae]);
      }
    }
    for (const oe of [oeMin, oeMax]) {
      const ae = verticalCrossing(oe, aeMin, aeMax, target);
      if (ae !== null) points.push([oe, ae]);
    }
  }

  const unique = dedupe(points);
  if (unique.length < 3) return unique;

  const cx = unique.reduce((s, [x]) => s + x, 0) / unique.length;
  const cy = unique.reduce((s, [, y]) => s + y, 0) / unique.length;
  return unique
    .slice()
    .sort(([ax, ay], [bx, by]) => Math.atan2(ay - cy, ax - cx) - Math.atan2(by - cy, bx - cx));
}

// Shoelace centroid of a simple polygon.
export function polygonCentroid(vertices) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const [x0, y0] = vertices[i];
    const [x1, y1] = vertices[(i + 1) % vertices.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return null;
  return [cx / (6 * area), cy / (6 * area)];
}

// Centroid of a style's feasible fermentation region, plus the derived AA/ABV.
// Returns null when any required range is absent (stats-less specialty styles).
export function styleCentroid(style) {
  const { og_min, og_max, fg_min, fg_max, abv_min, abv_max } = style ?? {};
  if ([og_min, og_max, fg_min, fg_max, abv_min, abv_max].some((v) => v === undefined || v === null)) {
    return null;
  }

  const vertices = feasibleVertices({ ogMin: og_min, ogMax: og_max, fgMin: fg_min, fgMax: fg_max, abvMin: abv_min, abvMax: abv_max });
  const centroid = polygonCentroid(vertices);
  if (!centroid) return null;
  const [oe, ae] = centroid;
  const og = platoToSg(oe);
  const fg = platoToSg(ae);
  return {
    oe,
    ae,
    og,
    fg,
    aa: (oe - ae) / oe,
    abv: cutaiaAbv(oe, ae),
    vertices,
  };
}

// --- Region navigation: slices, margins, and the model-free risk -----------

// Point-to-segment distance in extract (°P) space.
function pointSegmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// Ray-casting point-in-polygon (boundary points read as outside).
export function pointInRegion(vertices, oe, ae) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if (yi > ae !== yj > ae && oe < ((xj - xi) * (ae - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The range of the other axis where the polygon meets a line at `value` on
// `axis` (0 = OE/x, 1 = AE/y). A single interval (the region is convex).
function sliceAt(vertices, axis, value) {
  const other = axis === 0 ? 1 : 0;
  const hits = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (a[axis] === b[axis]) {
      if (value === a[axis]) hits.push(a[other], b[other]);
      continue;
    }
    const t = (value - a[axis]) / (b[axis] - a[axis]);
    if (t >= 0 && t <= 1) hits.push(a[other] + t * (b[other] - a[other]));
  }
  if (hits.length < 2) return null;
  return [Math.min(...hits), Math.max(...hits)];
}

export function oeExtent(vertices) {
  const xs = vertices.map(([x]) => x);
  return [Math.min(...xs), Math.max(...xs)];
}

export function aeExtent(vertices) {
  const ys = vertices.map(([, y]) => y);
  return [Math.min(...ys), Math.max(...ys)];
}

// Horizontal slice: the OE range at a given AE.
export function oeSliceAt(vertices, ae) {
  return sliceAt(vertices, 1, ae);
}

// Vertical slice: the AE range at a given OE.
export function aeSliceAt(vertices, oe) {
  return sliceAt(vertices, 0, oe);
}

// Minimum distance from a point to the region boundary.
export function edgeMargin(vertices, oe, ae) {
  let margin = Infinity;
  for (let i = 0; i < vertices.length; i += 1) {
    const [x0, y0] = vertices[i];
    const [x1, y1] = vertices[(i + 1) % vertices.length];
    margin = Math.min(margin, pointSegmentDistance(oe, ae, x0, y0, x1, y1));
  }
  return margin;
}

// The region's pole of inaccessibility (max-min-distance to the boundary).
// For elongated/convex regions the max-margin set can be a flat ridge, so
// among near-maximal points we return the one nearest the area centroid — a
// central "safest point" rather than an arbitrary end of the ridge.
export function chebyshevCenter(vertices) {
  if (vertices.length < 3) return null;
  const centroid = polygonCentroid(vertices);
  if (!centroid) return null;
  const [xMin, xMax] = oeExtent(vertices);
  const [yMin, yMax] = aeExtent(vertices);
  const grid = 60;
  const points = [];
  let bestMargin = -Infinity;
  for (let i = 0; i <= grid; i += 1) {
    for (let j = 0; j <= grid; j += 1) {
      const oe = xMin + ((xMax - xMin) * i) / grid;
      const ae = yMin + ((yMax - yMin) * j) / grid;
      if (!pointInRegion(vertices, oe, ae)) continue;
      const margin = edgeMargin(vertices, oe, ae);
      points.push([oe, ae, margin]);
      if (margin > bestMargin) bestMargin = margin;
    }
  }
  if (!points.length) return null;
  const tolerance = Math.max(1e-4, bestMargin * 1e-3);
  let chosen = null;
  let bestDistance = Infinity;
  for (const [oe, ae, margin] of points) {
    if (margin < bestMargin - tolerance) continue;
    const distance = Math.hypot(oe - centroid[0], ae - centroid[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      chosen = [oe, ae];
    }
  }
  return { oe: chosen[0], ae: chosen[1], radius: bestMargin };
}

// The target extract point and its derived (Plato-space) AA and ABV.
export function targetFromExtract(oe, ae) {
  return {
    oe,
    ae,
    og: platoToSg(oe),
    fg: platoToSg(ae),
    aa: (oe - ae) / oe,
    abv: cutaiaAbv(oe, ae),
  };
}

// Inverse: recover (OE, AE) from an AA (Plato) / ABV pair by 1D bisection.
// `AE = OE * (1 - AA)` and ABV increases monotonically with OE, so the root is
// unique over the physical 0-40 °P bracket.
export function extractFromTarget(aa, abv) {
  if (!(aa > 0 && aa < 1) || !(abv > 0)) return null;
  const residual = (oe) => cutaiaAbv(oe, oe * (1 - aa)) - abv;
  let lo = 1e-6;
  let hi = 40;
  if (residual(lo) * residual(hi) > 0) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (residual(lo) * residual(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const oe = (lo + hi) / 2;
  return { oe, ae: oe * (1 - aa) };
}

// The nearest of the six style limits (by normalized headroom) and its native
// headroom, for the risk readout.
export function limitHeadroom(envelope, oe, ae) {
  const { og, fg, abv } = targetFromExtract(oe, ae);
  const { ogMin, ogMax, fgMin, fgMax, abvMin, abvMax } = envelope;
  const rows = [
    { label: "OG min", headroom: og - ogMin, range: ogMax - ogMin, unit: "SG" },
    { label: "OG max", headroom: ogMax - og, range: ogMax - ogMin, unit: "SG" },
    { label: "FG min", headroom: fg - fgMin, range: fgMax - fgMin, unit: "SG" },
    { label: "FG max", headroom: fgMax - fg, range: fgMax - fgMin, unit: "SG" },
    { label: "ABV min", headroom: abv - abvMin, range: abvMax - abvMin, unit: "%" },
    { label: "ABV max", headroom: abvMax - abv, range: abvMax - abvMin, unit: "%" },
  ].filter((row) => row.range > 0);
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.headroom / a.range - b.headroom / b.range);
  return rows[0];
}
