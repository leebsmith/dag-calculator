// Fermentation geometry: the BJCP style's feasible OE/AE region and its
// centroid, from which the batch's apparent attenuation (AA) and target ABV are
// derived. Pure; the ASBC/Cutaia primitives and constants come from the
// artifact (`artifactFunctions.js`), which mirrors backend/app/core/utils.py.

import { artifactConstant, callArtifactFunction } from "./artifactFunctions.js";

// Solver extract-point conversion (kg extract per GU·L), matching
// backend/app/core/batch_solver.py::GAMMA_METRIC.
export const GAMMA_METRIC = 385.641;

// ASBC Table 1 cubic (SG -> degrees Plato).
export function sgToPlato(sg) {
  return callArtifactFunction("sg_to_plato", [sg]);
}

// ASBC 3rd-order polynomial (degrees Plato -> SG). Not the exact cubic inverse;
// matches backend/app/core/utils.py::plato_to_sg.
export function platoToSg(plato) {
  return callArtifactFunction("plato_to_sg", [plato]);
}

// Cutaia-Reid-Speers (2009) ABV (% v/v) from original/apparent extract (Plato).
export function cutaiaAbv(oe, ae) {
  return callArtifactFunction("cutaia_abv_plato", [oe, ae]);
}

// Ingredient fermentability is a real mass fraction of extract. Sources that
// publish an apparent attenuation (e.g. Dingemans' "Final attenuation") convert
// here, at the fixed reference gravity the priors were reconciled against.
export const INGREDIENT_REFERENCE_PLATO = 12;

export function apparentToRealAttenuation(apparentAttenuation, oe = INGREDIENT_REFERENCE_PLATO) {
  if (!Number.isFinite(apparentAttenuation) || !(oe > 0)) return apparentAttenuation;
  const aa = Math.min(Math.max(apparentAttenuation, 0), 1);
  const ae = oe * (1 - aa);
  const abw =
    (artifactConstant("cutaia_a") + artifactConstant("cutaia_b") * oe) * (oe - ae);
  const re = callArtifactFunction("cutaia_real_extract", [abw, ae]);
  return (oe - re) / oe;
}

// ABV along a fixed-AE (horizontal) edge is quadratic in OE; solve for OE.
function horizontalCrossings(ae, targetAbv) {
  const ethanolDensity = artifactConstant("ethanol_density");
  const cutaiaA = artifactConstant("cutaia_a");
  const cutaiaB = artifactConstant("cutaia_b");
  const k = platoToSg(ae) / ethanolDensity;
  const a = cutaiaB;
  const b = cutaiaA - cutaiaB * ae;
  const c = -cutaiaA * ae - targetAbv / k;
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

// Extract mass (kg) represented by an OE reading at a fixed cold volume.
export function extractMassKg(oe, volumeL) {
  return (1000 * (platoToSg(oe) - 1) * volumeL) / GAMMA_METRIC;
}

// OE needed to hit an ABV at fixed AE. Picks the physical root above AE.
export function oeForAbvAtAe(ae, targetAbv) {
  const roots = horizontalCrossings(ae, targetAbv)
    .filter((oe) => Number.isFinite(oe) && oe > ae)
    .sort((a, b) => a - b);
  return roots.length ? roots[0] : null;
}

// Cutaia real extract at one extract point (%), mirroring
// utils.cutaia_real_extract. The artifact function takes (abw, ae).
export function cutaiaRealExtract(oe, ae) {
  const abw =
    (artifactConstant("cutaia_a") + artifactConstant("cutaia_b") * oe) * (oe - ae);
  return callArtifactFunction("cutaia_real_extract", [abw, ae]);
}

// AE that holds a real extract at one OE. The regression is monotone in AE, so
// bisection lands within display precision.
export function apparentExtractForRealExtract(oe, realExtract) {
  if (!Number.isFinite(oe) || oe <= 0) return null;
  if (!Number.isFinite(realExtract) || realExtract < 0 || realExtract > oe) return null;
  const f = (ae) => cutaiaRealExtract(oe, ae) - realExtract;
  if (f(0) > 0 || f(oe) < 0) return null;
  let lo = 0;
  let hi = oe;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The extract points one shape can take, clipped to a box: hold the real
// extract fraction and sweep OE. This is the locus a scale change follows, so
// pinning a size moves the batch along it and never off it.
export function compositionLocus({ oeMin, oeMax, aeMin, aeMax, oe, ae, samples = 25 }) {
  if (!(oeMax > oeMin) || !(aeMax > aeMin) || !Number.isFinite(oe) || !(oe > 0)) {
    return [];
  }
  const realExtract = cutaiaRealExtract(oe, ae);
  if (!Number.isFinite(realExtract)) return [];
  const rdf = (oe - realExtract) / oe;
  const aeAt = (value) => apparentExtractForRealExtract(value, value * (1 - rdf));

  const crossing = (target) => {
    let lo = oeMin;
    let hi = oeMax;
    const fLo = aeAt(lo);
    const fHi = aeAt(hi);
    if (fLo === null || fHi === null) return null;
    if ((fLo - target) * (fHi - target) > 0) return null;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      const value = aeAt(mid);
      if (value === null) return null;
      if ((value - target) * (fLo - target) <= 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };

  const xLo = Math.max(oeMin, crossing(aeMin) ?? oeMin);
  const xHi = Math.min(oeMax, crossing(aeMax) ?? oeMax);
  if (!(xHi > xLo)) return [];
  const middle = aeAt((xLo + xHi) / 2);
  if (middle === null || middle < aeMin - 1e-9 || middle > aeMax + 1e-9) return [];

  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const value = xLo + ((xHi - xLo) * i) / (samples - 1);
    const pointAe = aeAt(value);
    if (pointAe === null) continue;
    points.push([value, pointAe]);
  }
  return points;
}

// One iso-ABV contour clipped to an (OE, AE) box. `oeForAbvAtAe` is increasing
// in AE, so the box intersection is the AE interval between the two x edges.
export function abvContour({ oeMin, oeMax, aeMin, aeMax, targetAbv, samples = 25 }) {
  if (!(oeMax > oeMin) || !(aeMax > aeMin) || !Number.isFinite(targetAbv)) return [];
  const oeAt = (ae) => oeForAbvAtAe(ae, targetAbv);
  const aeFor = (oe) => {
    const top = oeMax * 1.5;
    let lo = 0;
    let hi = top;
    const fLo = oeAt(lo);
    if (fLo === null || !Number.isFinite(fLo)) return null;
    if (fLo >= oe) return 0;
    let fHi = oeAt(hi);
    if (fHi === null || !Number.isFinite(fHi)) return null;
    if (fHi <= oe) return null;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      const value = oeAt(mid);
      if (value === null || !Number.isFinite(value)) return null;
      if (value < oe) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const start = aeFor(oeMin);
  const end = aeFor(oeMax);
  if (start === null || end === null) return [];
  const lo = Math.max(start, aeMin);
  const hi = Math.min(end, aeMax);
  if (!(hi > lo)) return [];

  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const ae = lo + ((hi - lo) * i) / (samples - 1);
    const oe = oeAt(ae);
    if (oe === null || !Number.isFinite(oe)) continue;
    points.push([oe, ae]);
  }
  return points;
}

// Advisory sugar vector: hold AE, raise OE until the target AA or ABV is met.
// Pure; never mutates a recipe. `sucroseKg` is the ingredient mass at
// `yieldSucrose` (1.0 for sucrose).
// ABV along a fixed-OE (vertical) edge is monotone decreasing in AE; bisect.
function verticalCrossing(oe, aeMin, aeMax, targetAbv) {  const f = (ae) => cutaiaAbv(oe, ae) - targetAbv;
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

// Intersection of the fixed-AA ray AE = OE * (1 - AA) with the polygon.
// Returns the OE/AE span inside the region, or null when the ray misses it.
export function raySegment(vertices, aa) {
  if (!(aa > 0 && aa < 1) || vertices.length < 3) return null;
  const slope = 1 - aa;
  const points = [];
  const push = (oe, ae) => {
    if (points.some(([x, y]) => Math.abs(x - oe) < 1e-9 && Math.abs(y - ae) < 1e-9)) return;
    points.push([oe, ae]);
  };
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const [x0, y0] = vertices[j];
    const [x1, y1] = vertices[i];
    const f0 = y0 - slope * x0;
    const f1 = y1 - slope * x1;
    if (Math.abs(f0) < 1e-9) push(x0, y0);
    if (Math.abs(f1) < 1e-9) push(x1, y1);
    if (f0 * f1 < 0) {
      const t = f0 / (f0 - f1);
      const oe = x0 + t * (x1 - x0);
      const ae = y0 + t * (y1 - y0);
      push(oe, ae);
    }
  }
  if (points.length < 2) return null;
  const oes = points.map(([oe]) => oe);
  const oeMin = Math.min(...oes);
  const oeMax = Math.max(...oes);
  return { oeMin, oeMax, aeMin: slope * oeMin, aeMax: slope * oeMax };
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

// --- Style-tag -> fermentation classification ------------------------------
// Maps a BJCP style's tags (plus its name) to the batch fermentation choice.
// Pure; shared by the style card and the seed-derivations registry.

const normalizeTag = (t) => (t ?? "").trim().toLowerCase().replace(/\s+/g, "-");

export function styleTagSet(style) {
  const raw = style?.tags ?? "";
  const tags = Array.isArray(raw) ? raw : String(raw).split(",");
  return new Set(tags.map(normalizeTag));
}

export function styleFermentation(style) {
  const tags = styleTagSet(style);
  const name = (style?.name ?? "").toLowerCase();
  if (tags.has("bottom-fermented")) return "lager";
  if (tags.has("wild-fermented") || tags.has("wild-fermentation")) return "wild";
  if (name.includes("mixed-fermentation")) return "mixed";
  return "ale";
}
