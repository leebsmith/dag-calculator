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
