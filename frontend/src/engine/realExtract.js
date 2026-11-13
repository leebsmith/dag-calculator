// Cutaia real-extract algebra: the regression itself and its inverse.
//
// The regression is quadratic in apparent extract once ABW = k(OE - AE) is
// substituted, so the inverse is closed-form. The bisection is a numerical
// fallback for degenerate coefficients; the plot and the solver share one
// definition of the regression.

import { artifactConstant, callArtifactFunction } from "./artifactFunctions.js";

export function cutaiaRealExtract(oe, ae) {
  const abw =
    (artifactConstant("cutaia_a") + artifactConstant("cutaia_b") * oe) * (oe - ae);
  return callArtifactFunction("cutaia_real_extract", [abw, ae]);
}

function coefficients(oe, realExtract) {
  const k = artifactConstant("cutaia_a") + artifactConstant("cutaia_b") * oe;
  const a = artifactConstant("cutaia_re_abw");
  const b = artifactConstant("cutaia_re_ae");
  const c = artifactConstant("cutaia_re_abw_ae");
  const d = artifactConstant("cutaia_re_ae2");
  return {
    A2: c * k - d,
    A1: b - a * k - c * k * oe,
    A0: a * k * oe - realExtract,
  };
}

function quadraticRoots(A2, A1, A0) {
  if (Math.abs(A2) < 1e-12) {
    if (Math.abs(A1) < 1e-15) return [];
    return [-A0 / A1];
  }
  const disc = A1 * A1 - 4 * A2 * A0;
  if (disc < 0) return [];
  const sqrt = Math.sqrt(disc);
  const q = -0.5 * (A1 + (A1 >= 0 ? sqrt : -sqrt));
  return q === 0 ? [-A1 / (2 * A2)] : [q / A2, A0 / q];
}

function rootInRange(roots, oe) {
  for (const root of roots) {
    if (Number.isFinite(root) && root >= 0 && root <= oe) return root;
  }
  return null;
}

function bisectionApparentExtract(oe, realExtract) {
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

export function apparentExtractForRealExtract(oe, realExtract) {
  if (!Number.isFinite(oe) || oe <= 0) return null;
  if (!Number.isFinite(realExtract) || realExtract < 0 || realExtract > oe) return null;
  const { A2, A1, A0 } = coefficients(oe, realExtract);
  const root = rootInRange(quadraticRoots(A2, A1, A0), oe);
  return root ?? bisectionApparentExtract(oe, realExtract);
}
